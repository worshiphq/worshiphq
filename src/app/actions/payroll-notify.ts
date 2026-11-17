"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { payrollActor, errorResult, type ActionResult } from "@/lib/payroll/access";
import { ensureSettings, writeEvent } from "@/lib/payroll/engine";
import { periodLabel } from "@/lib/payroll/calc";
import { payslipSmsText } from "@/lib/payroll/mask";
import { fmtMoney } from "@/lib/payroll/payslip-pdf";

/**
 * Tell staff their payslip is ready. Email: a link for staff who sign in to WorshipHQ (decision 11), otherwise the PDF
 * attached, always sent with private: true so the email log keeps neither body nor attachment. SMS: no amount unless
 * the church switched "Show the amount in payslip texts" on (texts are kept in SMS records some team members can see).
 */
export async function sendPayslips(runId: string, opts: { email: boolean; sms: boolean; lineIds?: string[] }): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  try {
    const run = await db.payrollRun.findFirst({ where: { id: String(runId), churchId: s.churchId }, select: { id: true, year: true, month: true, status: true } });
    if (!run) return { ok: false, error: "Payroll not found." };
    if (run.status !== "paid") return { ok: false, error: "Payslips go out once the payroll is marked as paid." };
    const { rateLimit, HOUR } = await import("@/lib/rate-limit");
    if (!(await rateLimit(`payslips:${run.id}`, 5, HOUR))) return { ok: false, error: "Payslips for this payroll were sent several times in the last hour. Please wait a while." };
    const lines = await db.payrollLine.findMany({
      where: { runId: run.id, churchId: s.churchId, excluded: false, ...(opts.lineIds?.length ? { id: { in: opts.lineIds.slice(0, 500) } } : {}) },
      select: { id: true, net: true, staff: { select: { phone: true, email: true, userId: true, firstName: true } } },
    });
    const [settings, church] = await Promise.all([
      ensureSettings(db, s.churchId),
      db.church.findUnique({ where: { id: s.churchId }, select: { name: true } }),
    ]);
    const period = periodLabel(run.year, run.month);
    const churchName = church?.name ?? "Your church";
    let emailed = 0, texted = 0, skipped = 0;

    if (opts.email) {
      const { sendEmail } = await import("@/lib/integrations/email");
      const { getBaseUrl } = await import("@/lib/url");
      const { payslipData } = await import("@/lib/payroll/payslip-data");
      const { renderPayslip } = await import("@/lib/payroll/payslip-pdf");
      const { escapeHtml } = await import("@/lib/html");
      const base = await getBaseUrl();
      for (const l of lines) {
        const to = l.staff?.email?.trim();
        if (!to || to.endsWith("@invite.worshiphq.app")) { skipped++; continue; }
        const name = escapeHtml(l.staff?.firstName ?? "");
        let res;
        if (l.staff?.userId) {
          res = await sendEmail({
            to, subject: `Your payslip for ${period}`, private: true, churchId: s.churchId,
            html: `<p>Hello ${name},</p><p>Your payslip for ${escapeHtml(period)} from ${escapeHtml(churchName)} is ready.</p><p><a href="${base}/app/my-pay">Open My pay to see and download it</a></p>`,
          });
        } else {
          const [slip] = await payslipData(s.churchId, [l.id]);
          if (!slip) { skipped++; continue; }
          const pdf = Buffer.from(await renderPayslip(slip.data));
          res = await sendEmail({
            to, subject: `Your payslip for ${period}`, private: true, churchId: s.churchId,
            html: `<p>Hello ${name},</p><p>Your payslip for ${escapeHtml(period)} from ${escapeHtml(churchName)} is attached. Please keep it private.</p>`,
            attachments: [{ filename: slip.fileName, content: pdf }],
          });
        }
        if (res.ok || res.stubbed) {
          emailed++;
          await db.payrollLine.update({ where: { id: l.id }, data: { emailedAt: new Date() } });
        }
      }
    }

    if (opts.sms) {
      const withPhone = lines.filter((l) => !!l.staff?.phone);
      if (withPhone.length) {
        const { sendChurchSms } = await import("@/lib/sms/credits");
        const r = await sendChurchSms(s.churchId, withPhone.map((l) => l.staff!.phone!), payslipSmsText(churchName, period), {
          note: `Payslip notices, ${period}`,
          textFor: (i) => payslipSmsText(churchName, period, settings.smsShowAmounts ? fmtMoney(Number(withPhone[i].net.toString())) : null),
        });
        if (r.insufficient) return { ok: false, error: "Not enough SMS credits for these texts. Top up in Settings, Billing." };
        texted = r.sent;
        const okIdx = (r.results ?? []).map((x, i) => ((x as { ok?: boolean }).ok ? i : -1)).filter((i) => i >= 0);
        const ids = (okIdx.length ? okIdx.map((i) => withPhone[i].id) : r.ok ? withPhone.map((l) => l.id) : []);
        if (ids.length) await db.payrollLine.updateMany({ where: { id: { in: ids }, churchId: s.churchId }, data: { smsAt: new Date() } });
      }
    }

    await writeEvent(db, { churchId: s.churchId, runId: run.id, action: "payslips.sent", actorId: s.userId, actorName: s.name, detail: `Sent payslip notices: ${emailed} by email, ${texted} by text` });
    revalidatePath(`/app/payroll/runs/${run.id}`);
    return { ok: true, message: `Sent ${emailed} email${emailed === 1 ? "" : "s"} and ${texted} text${texted === 1 ? "" : "s"}${skipped ? `. ${skipped} had no email address` : ""}` };
  } catch (e) {
    return errorResult(e);
  }
}
