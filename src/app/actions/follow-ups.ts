"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

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

  // Let the assigned person know they have a task (SMS + email).
  if (assigneeId) {
    const [assignee, person, church] = await Promise.all([
      db.user.findFirst({ where: { id: assigneeId, churchId: session.churchId }, select: { phone: true, email: true } }),
      personId ? db.person.findUnique({ where: { id: personId }, select: { firstName: true, lastName: true, phone: true } }) : Promise.resolve(null),
      db.church.findUnique({ where: { id: session.churchId }, select: { name: true } }),
    ]);
    if (assignee?.phone || assignee?.email) {
      const who = person ? ` — reach out to ${person.firstName} ${person.lastName}${person.phone ? ` (${person.phone})` : ""}` : "";
      const due = dueDate ? ` Due ${dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.` : "";
      const msg = `New follow-up assigned to you at ${church?.name ?? "your church"}: "${title}"${who}.${due}`;
      try {
        const { sendChurchSms } = await import("@/lib/sms/credits");
        const { sendEmail } = await import("@/lib/integrations/email");
        if (assignee.phone) await sendChurchSms(session.churchId, assignee.phone, msg, { note: "Follow-up assigned" });
        if (assignee.email && !assignee.email.endsWith("@invite.worshiphq.app")) {
          await sendEmail({ to: assignee.email, subject: `Follow-up assigned — ${title}`, html: `<p>${msg}</p>${note ? `<p>${note}</p>` : ""}` });
        }
      } catch { /* notification must not block the task */ }
    }
  }

  await audit(session, "create", "follow-up", `Created follow-up "${title}"${assigneeId ? " (assignee notified)" : ""}`);
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
  await audit(session, "delete", "follow-up", "Deleted a follow-up", id);
  revalidatePath("/app/follow-ups");
}
