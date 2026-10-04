import "server-only";
import { db } from "@/lib/db";

/**
 * Tell a team member a follow-up has been assigned to them (SMS if they have a
 * phone, plus email). Used by manual create, reassign, and auto-created tasks so
 * all three behave the same. Never throws - a failed notification must not block
 * the task itself.
 */
export async function notifyFollowUpAssignee(opts: {
  churchId: string;
  assigneeId: string;
  title: string;
  note?: string | null;
  dueDate?: Date | null;
  personId?: string | null;
  visitorId?: string | null;
}) {
  try {
    const [assignee, person, visitor, church] = await Promise.all([
      db.user.findFirst({ where: { id: opts.assigneeId, churchId: opts.churchId }, select: { name: true, phone: true, email: true } }),
      opts.personId ? db.person.findUnique({ where: { id: opts.personId }, select: { firstName: true, lastName: true, phone: true } }) : Promise.resolve(null),
      opts.visitorId ? db.visitor.findUnique({ where: { id: opts.visitorId }, select: { firstName: true, lastName: true, phone: true } }) : Promise.resolve(null),
      db.church.findUnique({ where: { id: opts.churchId }, select: { name: true, messageTemplates: true } }),
    ]);
    if (!assignee || (!assignee.phone && !assignee.email)) return;

    const who = person ?? visitor;
    const whoLine = who ? `Reach out to ${who.firstName} ${who.lastName}${who.phone ? ` (${who.phone})` : ""}.` : "";
    const due = opts.dueDate ? ` Due ${opts.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.` : "";

    const { templateFor, renderTemplate } = await import("@/lib/messages/registry");
    const msg = renderTemplate(templateFor(church?.messageTemplates, "followup_assigned"), {
      name: (assignee.name ?? "").split(" ")[0] || "there",
      church: church?.name ?? "your church",
      title: opts.title,
      details: `${whoLine}${due}`.trim(),
    });

    if (assignee.phone) {
      const { sendChurchSms } = await import("@/lib/sms/credits");
      await sendChurchSms(opts.churchId, assignee.phone, msg, { note: "Follow-up assigned" });
    }
    if (assignee.email && !assignee.email.endsWith("@invite.worshiphq.app")) {
      const { sendEmail } = await import("@/lib/integrations/email");
      await sendEmail({
        to: assignee.email,
        subject: `Follow-up assigned - ${opts.title}`,
        html: `<p>${msg}</p>${opts.note ? `<p>${opts.note}</p>` : ""}`,
        log: { churchId: opts.churchId, name: `Follow-up assigned: ${opts.title}`, segment: "follow-up" },
      });
    }
  } catch {
    /* notification must not block the task */
  }
}
