"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { RecycleBin } from "@/lib/recycle-bin";
import { notifyFollowUpAssignee } from "@/lib/follow-ups/notify";

export async function createFollowUp(formData: FormData) {
  const session = await requireModule("follow-ups");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const type = String(formData.get("type") ?? "custom");
  const note = String(formData.get("note") ?? "").trim() || null;
  const dueDateStr = String(formData.get("dueDate") ?? "").trim();
  const dueDate = dueDateStr ? new Date(dueDateStr) : null;
  const personId = String(formData.get("personId") ?? "").trim() || null;
  const visitorId = String(formData.get("visitorId") ?? "").trim() || null;

  // Only assign to someone who actually belongs to this church.
  const assigneeRaw = String(formData.get("assigneeId") ?? "").trim() || null;
  const assigneeId = assigneeRaw
    ? (await db.user.findFirst({ where: { id: assigneeRaw, churchId: session.churchId }, select: { id: true } }))?.id ?? null
    : null;

  await db.followUp.create({
    data: {
      church: { connect: { id: session.churchId } },
      title,
      type,
      note,
      dueDate,
      ...(assigneeId ? { assignee: { connect: { id: assigneeId } } } : {}),
      ...(personId ? { person: { connect: { id: personId } } } : {}),
      ...(visitorId ? { visitor: { connect: { id: visitorId } } } : {}),
    },
  });

  if (assigneeId) {
    await notifyFollowUpAssignee({ churchId: session.churchId, assigneeId, title, note, dueDate, personId, visitorId });
  }

  await audit(session, "create", "follow-up", `Created follow-up "${title}"${assigneeId ? " (assignee notified)" : ""}`);
  revalidatePath("/app/follow-ups");
}

export async function updateFollowUpStatus(formData: FormData) {
  const session = await requireModule("follow-ups");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["open", "in_progress", "done"].includes(status)) return;

  await db.followUp.updateMany({
    where: { id, churchId: session.churchId },
    data: {
      status,
      ...(status === "done" ? { completedAt: new Date() } : { completedAt: null }),
    },
  });

  revalidatePath("/app/follow-ups");
  revalidatePath("/app");
}

/** Hand a follow-up to someone else (or nobody). The new person is told. */
export async function assignFollowUp(id: string, assigneeId: string | null) {
  const session = await requireModule("follow-ups");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };

  const followUp = await db.followUp.findFirst({
    where: { id, churchId: session.churchId },
    select: { id: true, title: true, note: true, dueDate: true, personId: true, visitorId: true, assigneeId: true },
  });
  if (!followUp) return { ok: false as const, error: "Follow-up not found." };

  let next: string | null = null;
  if (assigneeId) {
    const user = await db.user.findFirst({ where: { id: assigneeId, churchId: session.churchId }, select: { id: true } });
    if (!user) return { ok: false as const, error: "That person is not on your team." };
    next = user.id;
  }
  if (next === followUp.assigneeId) return { ok: true as const };

  await db.followUp.update({ where: { id }, data: { assigneeId: next } });
  if (next) {
    await notifyFollowUpAssignee({
      churchId: session.churchId, assigneeId: next, title: followUp.title, note: followUp.note,
      dueDate: followUp.dueDate, personId: followUp.personId, visitorId: followUp.visitorId,
    });
  }
  await audit(session, "update", "follow-up", next ? "Reassigned a follow-up" : "Unassigned a follow-up", id);
  revalidatePath("/app/follow-ups");
  return { ok: true as const };
}

export async function setFollowUpDue(id: string, date: string | null) {
  const session = await requireModule("follow-ups");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const dueDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : null;
  await db.followUp.updateMany({ where: { id, churchId: session.churchId }, data: { dueDate } });
  revalidatePath("/app/follow-ups");
  revalidatePath("/app");
  return { ok: true as const };
}

/** Who auto-created follow-ups go to, and whether new members get one too. */
export async function saveFollowUpSettings(formData: FormData) {
  const session = await requireModule("follow-ups");
  if (session.isDemo) return;

  const raw = String(formData.get("assigneeId") ?? "").trim();
  const assignee = raw ? await db.user.findFirst({ where: { id: raw, churchId: session.churchId }, select: { id: true } }) : null;
  await db.church.update({
    where: { id: session.churchId },
    data: {
      followUpAssigneeId: assignee?.id ?? null,
      followUpNewMembers: String(formData.get("newMembers") ?? "") === "on",
    },
  });
  await audit(session, "update", "settings", "Updated follow-up settings");
  revalidatePath("/app/follow-ups");
}

export async function deleteFollowUp(formData: FormData) {
  const session = await requireModule("follow-ups");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await RecycleBin.captureFollowUp(session, id);
  await db.followUp.deleteMany({ where: { id, churchId: session.churchId } });
  await audit(session, "delete", "follow-up", "Deleted a follow-up", id);
  revalidatePath("/app/follow-ups");
  revalidatePath("/app");
}
