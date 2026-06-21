"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";

export async function createFollowUp(formData: FormData) {
  const session = await requireModule("people");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const type = String(formData.get("type") ?? "custom");
  const note = String(formData.get("note") ?? "").trim() || null;
  const assigneeId = String(formData.get("assigneeId") ?? "").trim() || null;
  const dueDateStr = String(formData.get("dueDate") ?? "").trim();
  const dueDate = dueDateStr ? new Date(dueDateStr) : null;
  const personId = String(formData.get("personId") ?? "").trim() || null;
  const visitorId = String(formData.get("visitorId") ?? "").trim() || null;

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

  revalidatePath("/app/follow-ups");
}

export async function updateFollowUpStatus(formData: FormData) {
  const session = await requireModule("people");
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
}

export async function deleteFollowUp(formData: FormData) {
  const session = await requireModule("people");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.followUp.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/follow-ups");
}
