"use server";

import { revalidatePath } from "next/cache";
import { requireModule, requireManage, assertCanWrite, assertCanDelete } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { RecycleBin, moveToBin } from "@/lib/recycle-bin";
import { notifyFollowUpAssignee } from "@/lib/follow-ups/notify";
import { REPORT_METHODS, REPORT_OUTCOMES, outcomeLabel } from "@/lib/follow-ups/outcomes";
import { canManage } from "@/lib/permissions";

type Session = Awaited<ReturnType<typeof requireModule>>;

/** Keep only ids that are real users of this church. */
async function validUserIds(churchId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const users = await db.user.findMany({ where: { churchId, id: { in: ids } }, select: { id: true } });
  const ok = new Set(users.map((u) => u.id));
  return ids.filter((id) => ok.has(id));
}

/** Is this signed-in person one of the people the follow-up is assigned to? */
async function isAssignee(session: Session, followUpId: string) {
  if (!session.userId) return false;
  const hit = await db.followUpAssignee.findFirst({
    where: { followUpId, userId: session.userId, followUp: { churchId: session.churchId } },
    select: { id: true },
  });
  return !!hit;
}

export async function createFollowUp(formData: FormData) {
  const session = await requireManage("follow-ups");
  assertCanWrite(session, "follow-ups");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const type = String(formData.get("type") ?? "custom");
  const note = String(formData.get("note") ?? "").trim() || null;
  const dueDateStr = String(formData.get("dueDate") ?? "").trim();
  const dueDate = dueDateStr ? new Date(dueDateStr) : null;
  const personId = String(formData.get("personId") ?? "").trim() || null;
  const visitorId = String(formData.get("visitorId") ?? "").trim() || null;

  // Only assign to people who actually belong to this church.
  const wanted = [...new Set([...formData.getAll("assigneeIds"), formData.get("assigneeId")].map((v) => String(v ?? "").trim()).filter(Boolean))];
  const assigneeIds = await validUserIds(session.churchId, wanted);

  const created = await db.followUp.create({
    data: {
      church: { connect: { id: session.churchId } },
      title,
      type,
      note,
      dueDate,
      ...(assigneeIds[0] ? { assignee: { connect: { id: assigneeIds[0] } } } : {}),
      ...(assigneeIds.length ? { assignees: { create: assigneeIds.map((userId) => ({ userId })) } } : {}),
      ...(personId ? { person: { connect: { id: personId } } } : {}),
      ...(visitorId ? { visitor: { connect: { id: visitorId } } } : {}),
    },
  });

  for (const assigneeId of assigneeIds) {
    await notifyFollowUpAssignee({ churchId: session.churchId, assigneeId, title, note, dueDate, personId, visitorId });
  }

  const assigneeCount = assigneeIds.length;
  await audit(session, "create", "follow-up", `Created follow-up "${title}"${assigneeCount ? ` (${assigneeCount} assignee${assigneeCount === 1 ? "" : "s"} notified)` : ""}`, created.id);
  revalidatePath("/app/follow-ups");
}

export async function updateFollowUpStatus(formData: FormData) {
  const session = await requireModule("follow-ups");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["open", "in_progress", "done"].includes(status)) return;
  if (session.isDemo) return;
  if (!canManage(session, "follow-ups") && !(await isAssignee(session, id))) {
    throw new Error("Only the people assigned to this follow-up, or a leader, can change its status.");
  }

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

/**
 * Set exactly who a follow-up is assigned to (one person, several, or nobody).
 * Anyone with Manage on follow-ups can do this. People newly added are told.
 */
export async function setFollowUpAssignees(id: string, userIds: string[]) {
  const session = await requireManage("follow-ups");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };

  const followUp = await db.followUp.findFirst({
    where: { id, churchId: session.churchId },
    select: { id: true, title: true, note: true, dueDate: true, personId: true, visitorId: true, assignees: { select: { userId: true } } },
  });
  if (!followUp) return { ok: false as const, error: "Follow-up not found." };

  const next = await validUserIds(session.churchId, [...new Set(userIds)]);
  const before = new Set(followUp.assignees.map((a) => a.userId));
  const added = next.filter((u) => !before.has(u));
  const removed = [...before].filter((u) => !next.includes(u));
  if (added.length === 0 && removed.length === 0) return { ok: true as const };

  await db.$transaction([
    ...(removed.length ? [db.followUpAssignee.deleteMany({ where: { followUpId: id, userId: { in: removed } } })] : []),
    ...(added.length ? [db.followUpAssignee.createMany({ data: added.map((userId) => ({ followUpId: id, userId })), skipDuplicates: true })] : []),
    db.followUp.update({ where: { id }, data: { assigneeId: next[0] ?? null } }),
  ]);

  for (const assigneeId of added) {
    await notifyFollowUpAssignee({
      churchId: session.churchId, assigneeId, title: followUp.title, note: followUp.note,
      dueDate: followUp.dueDate, personId: followUp.personId, visitorId: followUp.visitorId,
    });
  }
  await audit(session, "update", "follow-up", next.length ? `Changed who a follow-up is assigned to (${next.length})` : "Unassigned a follow-up", id);
  revalidatePath("/app/follow-ups");
  revalidatePath("/app");
  return { ok: true as const };
}

export async function setFollowUpDue(id: string, date: string | null) {
  const session = await requireManage("follow-ups");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const dueDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : null;
  await db.followUp.updateMany({ where: { id, churchId: session.churchId }, data: { dueDate } });
  revalidatePath("/app/follow-ups");
  revalidatePath("/app");
  return { ok: true as const };
}

/**
 * Report back on a follow-up: how they reached out and what happened. Moves an
 * open task to "in progress", or to "done" when the reporter says it is finished.
 */
export async function addFollowUpReport(input: { followUpId: string; method: string; outcome: string; note?: string; markDone?: boolean }) {
  // Viewing is enough: what matters is that this follow-up is assigned to you.
  const session = await requireModule("follow-ups");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  if (!(await isAssignee(session, input.followUpId))) {
    return { ok: false as const, error: "Only the people assigned to this follow-up can report on it. Ask a leader to assign you." };
  }
  if (!REPORT_METHODS.some((m) => m.value === input.method)) return { ok: false as const, error: "Choose how you reached out." };
  if (!REPORT_OUTCOMES.some((o) => o.value === input.outcome)) return { ok: false as const, error: "Choose what happened." };

  const followUp = await db.followUp.findFirst({ where: { id: input.followUpId, churchId: session.churchId }, select: { id: true, title: true, status: true } });
  if (!followUp) return { ok: false as const, error: "Follow-up not found." };

  // Support/demo sessions have no User row; keep the name only.
  const author = await db.user.findFirst({ where: { id: session.userId, churchId: session.churchId }, select: { id: true } });
  await db.followUpReport.create({
    data: {
      churchId: session.churchId,
      followUpId: followUp.id,
      authorId: author?.id ?? null,
      authorName: session.name || "Team member",
      method: input.method,
      outcome: input.outcome,
      note: input.note?.trim().slice(0, 2000) || null,
    },
  });

  const status = input.markDone ? "done" : followUp.status === "open" ? "in_progress" : followUp.status;
  if (status !== followUp.status) {
    await db.followUp.update({
      where: { id: followUp.id },
      data: { status, completedAt: status === "done" ? new Date() : null },
    });
  }

  await audit(session, "create", "follow-up", `Reported on "${followUp.title}": ${outcomeLabel(input.outcome)}`, followUp.id);
  revalidatePath("/app/follow-ups");
  revalidatePath("/app/follow-ups/report");
  revalidatePath("/app");
  return { ok: true as const };
}

/** Remove a report (its author, or anyone who manages follow-ups). */
export async function deleteFollowUpReport(id: string) {
  const session = await requireModule("follow-ups");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const report = await db.followUpReport.findFirst({ where: { id, churchId: session.churchId }, select: { authorId: true } });
  if (!report) return { ok: false as const, error: "Report not found." };
  if (report.authorId !== session.userId && !canManage(session, "follow-ups")) {
    return { ok: false as const, error: "Only the person who wrote it, or a leader, can remove this report." };
  }
  await moveToBin(session, "followUpReport", "FollowUpReport", id);
  await db.followUpReport.delete({ where: { id } });
  await audit(session, "delete", "follow-up", "Removed a follow-up report", id);
  revalidatePath("/app/follow-ups");
  revalidatePath("/app/follow-ups/report");
  return { ok: true as const };
}

/** Edit the task's details. */
export async function setFollowUpNote(id: string, note: string) {
  const session = await requireModule("follow-ups");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  if (!canManage(session, "follow-ups") && !(await isAssignee(session, id))) {
    return { ok: false as const, error: "Only the people assigned to this follow-up, or a leader, can edit its details." };
  }
  const clean = note.trim().slice(0, 2000) || null;
  const res = await db.followUp.updateMany({ where: { id, churchId: session.churchId }, data: { note: clean } });
  if (res.count === 0) return { ok: false as const, error: "Follow-up not found." };
  await audit(session, "update", "follow-up", "Updated a follow-up note", id);
  revalidatePath("/app/follow-ups");
  return { ok: true as const };
}

/** Who auto-created follow-ups go to, and whether new members get one too. */
export async function saveFollowUpSettings(formData: FormData) {
  const session = await requireManage("follow-ups");
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
  const session = await requireManage("follow-ups");
  assertCanDelete(session);
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await RecycleBin.captureFollowUp(session, id);
  await db.followUp.deleteMany({ where: { id, churchId: session.churchId } });
  await audit(session, "delete", "follow-up", "Deleted a follow-up", id);
  revalidatePath("/app/follow-ups");
  revalidatePath("/app");
}
