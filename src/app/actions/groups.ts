"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DAYS_FULL, DEFAULT_MEETING_REMINDER, renderMeetingReminder } from "@/lib/groups/meeting-reminder";

/** Parse the shared group fields (create + edit) from the form. */
function readGroupFields(formData: FormData) {
  const days = formData.getAll("meetingDays").map((d) => String(d).trim()).filter((d) => DAYS_FULL.includes(d));
  const meetingDays = [...new Set(days)];
  return {
    name: String(formData.get("name") ?? "").trim(),
    type: String(formData.get("type") ?? "").trim() || "small_group",
    description: String(formData.get("description") ?? "").trim() || null,
    meetingDays,
    // Keep the legacy single-day column in sync (first day) for anything still reading it.
    meetingDay: meetingDays[0] ?? null,
    meetingTime: String(formData.get("meetingTime") ?? "").trim() || null,
    location: String(formData.get("location") ?? "").trim() || null,
    leaderId: String(formData.get("leaderId") ?? "").trim() || null,
    meetingReminderOn: formData.get("meetingReminderOn") === "on" && meetingDays.length > 0,
    meetingReminderAuto: String(formData.get("meetingReminderMode") ?? "auto") !== "manual",
    meetingReminderLeadDays: Math.min(14, Math.max(0, parseInt(String(formData.get("meetingReminderLeadDays") ?? "0"), 10) || 0)),
    meetingReminderHour: Math.min(23, Math.max(0, parseInt(String(formData.get("meetingReminderHour") ?? "8"), 10) || 8)),
    meetingReminderText: String(formData.get("meetingReminderText") ?? "").trim() || null,
  };
}

export async function createGroup(formData: FormData) {
  const session = await requireModule("people");
  if (session.isDemo) return;

  const f = readGroupFields(formData);
  if (!f.name) return;

  const group = await db.group.create({
    data: { churchId: session.churchId, ...f },
  });

  await audit(session, "create", "group", `Created group "${f.name}"`, group.id);
  revalidatePath("/app/groups");
}

export async function updateGroup(formData: FormData) {
  const session = await requireModule("people");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const f = readGroupFields(formData);
  if (!f.name) return;

  await db.group.updateMany({
    where: { id, churchId: session.churchId },
    data: { ...f },
  });

  await audit(session, "update", "group", `Updated group "${f.name}"`, id);
  revalidatePath("/app/groups");
  revalidatePath(`/app/groups/${id}`);
}

/** Send this group's meeting reminder to its members now (manual). */
export async function sendGroupMeetingReminder(groupId: string) {
  const session = await requireModule("people");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };

  const [group, church] = await Promise.all([
    db.group.findFirst({
      where: { id: groupId, churchId: session.churchId },
      select: {
        name: true, meetingDays: true, meetingDay: true, meetingTime: true, meetingReminderText: true,
        members: { where: { phone: { not: null } }, select: { phone: true } },
      },
    }),
    db.church.findUnique({ where: { id: session.churchId }, select: { name: true } }),
  ]);
  if (!group) return { ok: false as const, error: "Group not found." };

  const phones = group.members.map((m) => m.phone!).filter(Boolean);
  if (phones.length === 0) return { ok: false as const, error: "No members with a phone number in this group." };

  const days = group.meetingDays.length ? group.meetingDays : group.meetingDay ? [group.meetingDay] : [];
  const message = renderMeetingReminder(group.meetingReminderText ?? DEFAULT_MEETING_REMINDER, {
    church: church?.name ?? "your church", group: group.name, days, time: group.meetingTime,
  });

  const { sendChurchSms } = await import("@/lib/sms/credits");
  const res = await sendChurchSms(session.churchId, phones, message, { note: `Meeting reminder: ${group.name}` });
  if (!res.ok && res.insufficient) return { ok: false as const, error: `Not enough SMS credits — need ${res.cost}, have ${res.balance}.` };
  if (!res.ok) return { ok: false as const, error: "Couldn't send the reminder." };

  await audit(session, "send", "group", `Sent meeting reminder to ${res.sent} member(s) of "${group.name}"`, groupId);
  revalidatePath("/app/groups");
  return { ok: true as const, sent: res.sent };
}

export async function deleteGroup(formData: FormData) {
  const session = await requireModule("people");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const group = await db.group.findFirst({ where: { id, churchId: session.churchId }, select: { name: true } });

  await db.group.deleteMany({
    where: { id, churchId: session.churchId },
  });

  if (group) await audit(session, "delete", "group", `Deleted group "${group.name}"`, id);
  revalidatePath("/app/groups");
}

export async function addGroupMember(formData: FormData) {
  const session = await requireModule("people");
  if (session.isDemo) return;

  const groupId = String(formData.get("groupId"));
  const personId = String(formData.get("personId"));

  await db.group.update({
    where: { id: groupId, churchId: session.churchId },
    data: { members: { connect: { id: personId } } },
  });

  revalidatePath(`/app/groups/${groupId}`);
}

export async function removeGroupMember(formData: FormData) {
  const session = await requireModule("people");
  if (session.isDemo) return;

  const groupId = String(formData.get("groupId"));
  const personId = String(formData.get("personId"));

  await db.group.update({
    where: { id: groupId, churchId: session.churchId },
    data: { members: { disconnect: { id: personId } } },
  });

  revalidatePath(`/app/groups/${groupId}`);
}
