import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/integrations/email";
import { sendSms } from "@/lib/integrations/sms";
import { escapeHtml } from "@/lib/html";
import { issueUpgradeReceipt } from "@/lib/receipts/service";
import { receiptNumber } from "@/lib/receipts/types";

/** What a PDF receipt needs to know about a plan payment (the email and text use the readable `amount` instead). */
export type UpgradeReceiptDetails = {
  /** GHS actually paid. */
  amountGhs: number;
  /** GHS taken off by a coupon. */
  discountGhs?: number;
  from?: Date | null;
  to?: Date | null;
  kind?: "upgrade" | "gift";
  method?: string;
  prorated?: boolean;
};

/** Email (with a PDF receipt) + SMS to the church Owner after a plan is switched on. */
export async function sendUpgradeReceipt(churchId: string, planName: string, amount: string, interval: string, reference: string, details?: UpgradeReceiptDetails) {
  const admin = await db.user.findFirst({
    where: { churchId, role: "Owner" },
    select: { email: true, phone: true, name: true },
  });
  const church = await db.church.findUnique({ where: { id: churchId }, select: { name: true } });
  if (!admin) return;

  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // The PDF receipt. If drawing it fails, the plain email and text still go out.
  let pdf: Awaited<ReturnType<typeof issueUpgradeReceipt>> = null;
  if (details) {
    try {
      pdf = await issueUpgradeReceipt({
        churchId, planName, interval, reference, amount: details.amountGhs, discount: details.discountGhs,
        from: details.from, to: details.to, kind: details.kind, method: details.method, prorated: details.prorated,
      });
    } catch (e) {
      console.error("[upgrade receipt pdf]", (e as Error).message);
    }
  }

  if (admin.email) {
    const res = await sendEmail({
      to: admin.email,
      subject: `WorshipHQ - Upgraded to ${planName}!`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
          <h2 style="color:#0d7377">🚀 You're on the ${escapeHtml(planName)} plan!</h2>
          <p>Hi ${escapeHtml(admin.name ?? "there")},</p>
          <p>Your church <strong>${escapeHtml(church?.name ?? "")}</strong> has been upgraded to the <strong>${escapeHtml(planName)}</strong> plan. All new features are now unlocked.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#666">Plan</td><td style="padding:8px 0;font-weight:600">${escapeHtml(planName)}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Amount</td><td style="padding:8px 0;font-weight:600">${escapeHtml(amount)}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Billing</td><td style="padding:8px 0">${interval === "yearly" ? "Yearly" : "Monthly"}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Date</td><td style="padding:8px 0">${date}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Reference</td><td style="padding:8px 0;font-family:monospace;font-size:13px">${escapeHtml(reference)}</td></tr>
          </table>
          <p style="margin-top:24px"><a href="${appUrl}/app/settings?tab=billing" style="background:#0d7377;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600">View your plan</a></p>
          <p style="margin-top:32px;color:#999;font-size:12px">${pdf ? `Your PDF receipt (${escapeHtml(receiptNumber(pdf.row))}) is attached. Keep it for your records.` : "This is your payment receipt. Keep it for your records."}</p>
        </div>`,
      log: { churchId, name: `Plan upgrade receipt: ${planName}`, segment: "receipt" },
      ...(pdf ? { attachments: [{ filename: `Receipt ${receiptNumber(pdf.row)}.pdf`, content: pdf.pdf }] } : {}),
    });
    if (pdf) {
      await db.receipt.update({
        where: { id: pdf.row.id },
        data: { emailStatus: res.stubbed ? "stubbed" : res.ok ? "sent" : "failed", emailError: res.ok ? null : res.error ?? null, ...(res.ok ? { emailedAt: new Date() } : {}) },
      }).catch(() => {});
    }
  }

  if (admin.phone) {
    await sendSms(
      admin.phone,
      `✅ ${church?.name ?? "Your church"} has been upgraded to the ${planName} plan! Amount: ${amount} (${interval}). Ref: ${reference}. Log in to see your new features.`,
      { heading: null },
    );
  }
}
