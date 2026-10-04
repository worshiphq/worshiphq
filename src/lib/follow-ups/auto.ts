import "server-only";
import { db } from "@/lib/db";
import { notifyFollowUpAssignee } from "./notify";

/**
 * Create a follow-up task for a new visitor or new member, assign it to the
 * church's chosen follow-up lead, and tell them. This is the one place every
 * "someone new arrived" path goes through (public visit form, admin add-visitor,
 * member self-registration), so they all behave the same:
 *
 *  - no duplicate if an open task for that same person/visitor already exists
 *  - assigned to Church.followUpAssigneeId when that user still exists
 *  - new-member tasks only when the church has switched them on
 */
export async function createAutoFollowUp(input: {
  churchId: string;
  type: "new_visitor" | "new_member";
  title: string;
  note?: string | null;
  dueInDays: number;
  visitorId?: string;
  personId?: string;
}): Promise<{ created: boolean }> {
  try {
    if (!input.visitorId && !input.personId) return { created: false };

    const church = await db.church.findUnique({
      where: { id: input.churchId },
      select: { followUpAssigneeId: true, followUpNewMembers: true },
    });
    if (!church) return { created: false };
    if (input.type === "new_member" && !church.followUpNewMembers) return { created: false };

    const existing = await db.followUp.findFirst({
      where: {
        churchId: input.churchId,
        type: input.type,
        status: { not: "done" },
        ...(input.visitorId ? { visitorId: input.visitorId } : { personId: input.personId }),
      },
      select: { id: true },
    });
    if (existing) return { created: false };

    const assignee = church.followUpAssigneeId
      ? await db.user.findFirst({ where: { id: church.followUpAssigneeId, churchId: input.churchId }, select: { id: true } })
      : null;

    const dueDate = new Date(Date.now() + input.dueInDays * 86400000);
    await db.followUp.create({
      data: {
        churchId: input.churchId,
        type: input.type,
        title: input.title,
        note: input.note ?? null,
        dueDate,
        visitorId: input.visitorId ?? null,
        personId: input.personId ?? null,
        assigneeId: assignee?.id ?? null,
      },
    });

    if (assignee) {
      await notifyFollowUpAssignee({
        churchId: input.churchId,
        assigneeId: assignee.id,
        title: input.title,
        note: input.note,
        dueDate,
        visitorId: input.visitorId,
        personId: input.personId,
      });
    }
    return { created: true };
  } catch (e) {
    console.error("[follow-ups] auto-create failed:", e);
    return { created: false };
  }
}
