import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/integrations/email";
import { sendSms } from "@/lib/integrations/sms";
import { escapeHtml } from "@/lib/html";

/** Email + SMS receipt to the church Owner after a plan is switched on. */
export async function sendUpgradeReceipt(churchId: string, planName: string, amount: string, interval: string, reference: string) {
  const admin = await db.user.findFirst({
    where: { churchId, role: "Owner" },
    select: { email: true, phone: true, name: true },
  });
  const church = await db.church.findUnique({ where: { id: churchId }, select: { name: true } });
  if (!admin) return;

  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  if (admin.email) {
    await sendEmail({
      to: admin.email,
      subject: `WorshipHQ - Upgraded to ${planName}!`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
          <h2 style="color:#0d7377">🚀 You're on the ${planName} plan!</h2>
          <p>Hi ${escapeHtml(admin.name ?? "there")},</p>
          <p>Your church <strong>${escapeHtml(church?.name ?? "")}</strong> has been upgraded to the <strong>${planName}</strong> plan. All new features are now unlocked.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#666">Plan</td><td style="padding:8px 0;font-weight:600">${planName}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Amount</td><td style="padding:8px 0;font-weight:600">${amount}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Billing</td><td style="padding:8px 0">${interval === "yearly" ? "Yearly" : "Monthly"}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Date</td><td style="padding:8px 0">${date}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Reference</td><td style="padding:8px 0;font-family:monospace;font-size:13px">${reference}</td></tr>
          </table>
          <p style="margin-top:24px"><a href="${appUrl}/app/settings?tab=billing" style="background:#0d7377;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600">View your plan</a></p>
          <p style="margin-top:32px;color:#999;font-size:12px">This is your payment receipt. Keep it for your records.</p>
        </div>`,
      log: { churchId, name: `Plan upgrade receipt: ${planName}`, segment: "receipt" },
    });
  }

  if (admin.phone) {
    await sendSms(
      admin.phone,
      `✅ ${church?.name ?? "Your church"} has been upgraded to the ${planName} plan! Amount: ${amount} (${interval}). Ref: ${reference}. Log in to see your new features.`,
      { heading: null },
    );
  }
}
