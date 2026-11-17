import "server-only";
import { db } from "@/lib/db";
import { onlyWithFeature } from "@/lib/plan-gate-batch";
import { forEachChurch, type Deadline } from "@/lib/automations/pool";
import { POSTING_LABEL } from "@/lib/payroll/defaults";
import { periodLabel } from "@/lib/payroll/calc";

const DAY = 86_400_000;

/**
 * Daily: email the church's payroll managers when SSNIT, PAYE or deductions are due within 3 days (or overdue), once
 * per payment. The email names what is due and when, never the amount, and is sent privately (not kept in the log).
 */
export async function runPayrollReminders(now = new Date(), deadline?: Deadline) {
  const soon = new Date(now.getTime() + 3 * DAY);
  const churches = await onlyWithFeature(await db.church.findMany({
    where: { isDemo: false, payrollPostings: { some: { status: "pending", remindedAt: null, dueDate: { lte: soon } } }, payrollSettings: { is: { remindersOn: true } } },
    select: { id: true, name: true },
  }), "payroll");
  let sent = 0;
  const pool = await forEachChurch(churches, async (church) => {
    const due = await db.payrollPosting.findMany({
      where: { churchId: church.id, status: "pending", remindedAt: null, dueDate: { lte: soon } },
      include: { run: { select: { year: true, month: true, status: true } } },
      take: 20,
    });
    const live = due.filter((p) => p.run.status === "paid");
    if (!live.length) return;
    const claimed = await db.payrollPosting.updateMany({ where: { id: { in: live.map((p) => p.id) }, remindedAt: null }, data: { remindedAt: now } });
    if (!claimed.count) return;
    const managers = await db.user.findMany({
      where: { churchId: church.id, staffPortalOnly: false, OR: [{ role: "Owner" }, { payrollAccess: "manage" }] },
      select: { email: true },
    });
    const to = managers.map((m) => m.email).filter((e) => e && !e.endsWith("@invite.worshiphq.app"));
    if (!to.length) return;
    const { sendEmail } = await import("@/lib/integrations/email");
    const { getBaseUrl } = await import("@/lib/url");
    const { escapeHtml } = await import("@/lib/html");
    const items = live.map((p) => {
      const when = p.dueDate ? p.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }) : "soon";
      const overdue = p.dueDate && p.dueDate < now;
      return `<li>${escapeHtml(POSTING_LABEL[p.kind] ?? p.kind)} for ${periodLabel(p.run.year, p.run.month)}: ${overdue ? "was due" : "due"} ${when}</li>`;
    }).join("");
    const res = await sendEmail({
      to, private: true, churchId: church.id,
      subject: `Payroll payments due at ${church.name}`,
      html: `<p>These payroll payments are due soon:</p><ul>${items}</ul><p>When you have paid them, record it under <a href="${await getBaseUrl()}/app/payroll">Payroll, To pay over</a>.</p>`,
    });
    if (res.ok || res.stubbed) sent++;
    else await db.payrollPosting.updateMany({ where: { id: { in: live.map((p) => p.id) } }, data: { remindedAt: null } });
  }, { deadline, label: "payrollReminders" });
  return { churches: churches.length, sent, ...pool };
}
