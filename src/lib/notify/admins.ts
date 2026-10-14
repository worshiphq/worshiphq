import "server-only";
import { db } from "@/lib/db";
import { sendChurchSms } from "@/lib/sms/credits";
import { sendEmail } from "@/lib/integrations/email";

/**
 * Notify a church's admins (SMS + email) that a member submitted something -
 * a prayer request, testimony or counselling request. Respects the church's
 * notifySubmissions toggle and never throws (notifications must not block the
 * submission itself).
 */
export async function notifyChurchAdmins(
  churchId: string,
  opts: { subject: string; sms: string; emailHtml?: string; /** Send even if the church switched submission alerts off. */ force?: boolean; /** Only these team members (user ids) instead of every admin. */ userIds?: string[] },
) {
  try {
    const church = await db.church.findUnique({
      where: { id: churchId },
      select: { name: true, notifySubmissions: true },
    });
    if (!church || (church.notifySubmissions === false && !opts.force)) return;

    const admins = await db.user.findMany({
      where: opts.userIds?.length ? { churchId, id: { in: opts.userIds } } : { churchId, role: { in: ["Owner", "Admin", "Pastor"] } },
      select: { phone: true, email: true },
    });

    const phones = [...new Set(admins.map((a) => a.phone).filter((p): p is string => !!p))];
    // Real email addresses only (skip synthesized invite placeholders).
    const emails = [...new Set(
      admins.map((a) => a.email).filter((e): e is string => !!e && !e.endsWith("@invite.worshiphq.app")),
    )];

    if (phones.length) {
      await sendChurchSms(churchId, phones, opts.sms, { note: opts.subject });
    }
    if (emails.length) {
      await sendEmail({
        to: emails,
        subject: `${opts.subject} - ${church.name}`,
        html: opts.emailHtml ?? `<p>${opts.sms}</p>`,
        log: { churchId, name: opts.subject, segment: "admin-alert" },
      });
    }
  } catch (e) {
    console.error("[notifyChurchAdmins] failed:", e);
  }
}
