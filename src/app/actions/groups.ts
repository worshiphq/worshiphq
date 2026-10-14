"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireModule, requireManage } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { RecycleBin } from "@/lib/recycle-bin";
import { DEFAULT_MEETING_REMINDER, renderMeetingReminder, parseSchedule } from "@/lib/groups/meeting-reminder";

/** Parse the shared group fields (create + edit) from the form. */
function readGroupFields(formData: FormData) {
  // meetingSchedule is a hidden JSON field: [{ day, time }]
  let scheduleRaw: unknown = [];
  try { scheduleRaw = JSON.parse(String(formData.get("meetingSchedule") ?? "[]")); } catch { scheduleRaw = []; }
  const schedule = parseSchedule(scheduleRaw);
  const meetingDays = schedule.map((s) => s.day);

  return {
    name: String(formData.get("name") ?? "").trim(),
    type: String(formData.get("type") ?? "").trim() || "small_group",
    description: String(formData.get("description") ?? "").trim() || null,
    meetingDays,
    meetingSchedule: schedule,
    // Keep the legacy single columns in sync (first entry) for anything still reading them.
    meetingDay: schedule[0]?.day ?? null,
    meetingTime: schedule[0]?.time ?? null,
    location: String(formData.get("location") ?? "").trim() || null,
    leaderId: String(formData.get("leaderId") ?? "").trim() || null,
    onForms: formData.get("onForms") === "on",
    meetingReminderOn: formData.get("meetingReminderOn") === "on" && meetingDays.length > 0,
    meetingReminderAuto: String(formData.get("meetingReminderMode") ?? "auto") !== "manual",
    meetingReminderLeadDays: Math.min(14, Math.max(0, parseInt(String(formData.get("meetingReminderLeadDays") ?? "0"), 10) || 0)),
    meetingReminderHour: Math.min(23, Math.max(0, parseInt(String(formData.get("meetingReminderHour") ?? "8"), 10) || 8)),
    meetingReminderMinute: Math.min(59, Math.max(0, parseInt(String(formData.get("meetingReminderMinute") ?? "0"), 10) || 0)),
    meetingReminderWeekday: (() => { const s = String(formData.get("meetingReminderWeekday") ?? "").trim(); if (s === "") return null; const n = parseInt(s, 10); return Number.isFinite(n) && n >= 0 && n <= 6 ? n : null; })(),
    meetingReminderText: String(formData.get("meetingReminderText") ?? "").trim() || null,
  };
}

export async function createGroup(formData: FormData) {
  const session = await requireManage("groups");
  if (session.isDemo) return;

  const f = readGroupFields(formData);
  if (!f.name) return;

  const group = await db.group.create({
    data: { churchId: session.churchId, ...f, meetingSchedule: f.meetingSchedule as unknown as Prisma.InputJsonValue },
  });

  await audit(session, "create", "group", `Created group "${f.name}"`, group.id);
  revalidatePath("/app/groups");
}

/** Create several suggested groups at once (anything with the same name is skipped). */
export async function createSuggestedGroups(items: { name: string; type: string }[]) {
  const session = await requireManage("groups");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const wanted = items.map((i) => ({ name: String(i.name ?? "").trim().slice(0, 80), type: String(i.type ?? "").trim().slice(0, 40) || "small_group" })).filter((i) => i.name).slice(0, 40);
  if (wanted.length === 0) return { ok: false as const, error: "Choose at least one group." };
  const existing = await db.group.findMany({ where: { churchId: session.churchId }, select: { name: true } });
  const have = new Set(existing.map((g) => g.name.trim().toLowerCase()));
  let created = 0;
  for (const w of wanted) {
    if (have.has(w.name.toLowerCase())) continue;
    have.add(w.name.toLowerCase());
    await db.group.create({ data: { churchId: session.churchId, name: w.name, type: w.type } });
    created++;
  }
  await audit(session, "create", "group", `Created ${created} suggested group${created === 1 ? "" : "s"}`);
  revalidatePath("/app/groups");
  return { ok: true as const, created };
}

export async function updateGroup(formData: FormData) {
  const session = await requireManage("groups");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const f = readGroupFields(formData);
  if (!f.name) return;

  await db.group.updateMany({
    where: { id, churchId: session.churchId },
    data: { ...f, meetingSchedule: f.meetingSchedule as unknown as Prisma.InputJsonValue },
  });

  await audit(session, "update", "group", `Updated group "${f.name}"`, id);
  revalidatePath("/app/groups");
  revalidatePath(`/app/groups/${id}`);
}

/** Send this group's meeting reminder to its members now (manual). */
export async function sendGroupMeetingReminder(groupId: string) {
  const session = await requireManage("groups");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };

  const [group, church] = await Promise.all([
    db.group.findFirst({
      where: { id: groupId, churchId: session.churchId },
      select: {
        name: true, meetingSchedule: true, meetingDay: true, meetingTime: true, meetingReminderText: true,
        members: { where: { phone: { not: null } }, select: { phone: true } },
      },
    }),
    db.church.findUnique({ where: { id: session.churchId }, select: { name: true } }),
  ]);
  if (!group) return { ok: false as const, error: "Group not found." };

  const phones = group.members.map((m) => m.phone!).filter(Boolean);
  if (phones.length === 0) return { ok: false as const, error: "No members with a phone number in this group." };

  // Manual send covers the whole schedule (all meeting days + their times).
  let schedule = parseSchedule(group.meetingSchedule);
  if (schedule.length === 0 && group.meetingDay) schedule = [{ day: group.meetingDay, time: group.meetingTime }];
  const message = renderMeetingReminder(group.meetingReminderText ?? DEFAULT_MEETING_REMINDER, {
    church: church?.name ?? "your church", group: group.name, schedule,
  });

  const { sendChurchSms } = await import("@/lib/sms/credits");
  const res = await sendChurchSms(session.churchId, phones, message, { note: `Meeting reminder: ${group.name}` });
  if (!res.ok && res.insufficient) return { ok: false as const, error: `Not enough SMS credits - need ${res.cost}, have ${res.balance}.` };
  if (!res.ok) return { ok: false as const, error: "Couldn't send the reminder." };

  await audit(session, "send", "group", `Sent meeting reminder to ${res.sent} member(s) of "${group.name}"`, groupId);
  revalidatePath("/app/groups");
  return { ok: true as const, sent: res.sent };
}

export async function deleteGroup(formData: FormData) {
  const session = await requireManage("groups");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const group = await db.group.findFirst({ where: { id, churchId: session.churchId }, select: { name: true } });

  await RecycleBin.captureGroup(session, id);
  await db.group.deleteMany({
    where: { id, churchId: session.churchId },
  });

  if (group) await audit(session, "delete", "group", `Deleted group "${group.name}"`, id);
  revalidatePath("/app/groups");
}

export async function addGroupMember(formData: FormData) {
  const session = await requireManage("groups");
  if (session.isDemo) return;

  const groupId = String(formData.get("groupId"));
  const personId = String(formData.get("personId"));

  const person = await db.person.findFirst({ where: { id: personId, churchId: session.churchId }, select: { id: true } });
  if (!person) return;
  await db.group.update({
    where: { id: groupId, churchId: session.churchId },
    data: { members: { connect: { id: personId } } },
  });

  revalidatePath(`/app/groups/${groupId}`);
}

/** Add several people to a group at once (only people of this church are accepted). */
export async function addGroupMembers(groupId: string, personIds: string[]) {
  const session = await requireManage("groups");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const group = await db.group.findFirst({ where: { id: groupId, churchId: session.churchId }, select: { id: true, name: true } });
  if (!group) return { ok: false as const, error: "Group not found." };
  const valid = await db.person.findMany({ where: { churchId: session.churchId, id: { in: personIds.slice(0, 500) } }, select: { id: true } });
  if (valid.length === 0) return { ok: false as const, error: "Pick at least one person." };
  await db.group.update({ where: { id: groupId }, data: { members: { connect: valid.map((p) => ({ id: p.id })) } } });
  await audit(session, "update", "group", `Added ${valid.length} people to "${group.name}"`, groupId);
  revalidatePath(`/app/groups/${groupId}`);
  revalidatePath("/app/groups");
  return { ok: true as const, added: valid.length };
}

export async function removeGroupMember(formData: FormData) {
  const session = await requireManage("groups");
  if (session.isDemo) return;

  const groupId = String(formData.get("groupId"));
  const personId = String(formData.get("personId"));

  await db.group.update({
    where: { id: groupId, churchId: session.churchId },
    data: { members: { disconnect: { id: personId } } },
  });

  revalidatePath(`/app/groups/${groupId}`);
}
