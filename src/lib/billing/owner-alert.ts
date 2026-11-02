import "server-only";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/integrations/email";
import { escapeHtml } from "@/lib/html";

/**
 * Where "a church just paid" alerts go. The platform owner only, for now (deliberately NOT the partner).
 * Override or extend later with OWNER_ALERT_EMAIL (comma-separated for more than one).
 */
export function ownerAlertRecipients(): string[] {
  const raw = process.env.OWNER_ALERT_EMAIL || "worshiphqapp@gmail.com";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

type PaymentAlert = {
  churchId: string;
  /** What the money was for, in plain words: "Starter plan (monthly)" or "500 SMS credits". */
  what: string;
  amountGhs: number;
  /** Which gateway took the money: "paystack" | "hubtel" | "offline". */
  provider?: string | null;
  reference?: string | null;
  kind: "plan" | "topup";
};

/**
 * Email the platform owner whenever real money comes in (a plan payment or an SMS top-up, on any gateway).
 * Fire-and-forget: a failed alert must never undo a payment, and payments with no money (a 100% coupon or a
 * gift) are skipped.
 */
export async function alertOwnerPayment(a: PaymentAlert): Promise<void> {
  try {
    if (!(a.amountGhs > 0)) return;
    const to = ownerAlertRecipients();
    if (!to.length) return;

    const church = await db.church.findUnique({ where: { id: a.churchId }, select: { name: true } });
    const name = church?.name ?? a.churchId;
    const amount = `₵${a.amountGhs.toLocaleString()}`;
    const label = a.kind === "plan" ? "Plan payment" : "SMS top-up";
    const when = new Date().toLocaleString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const row = (k: string, v: string, mono = false) =>
      `<tr><td style="padding:6px 0;color:#666">${k}</td><td style="padding:6px 0;font-weight:600${mono ? ";font-family:monospace;font-size:13px;font-weight:400" : ""}">${v}</td></tr>`;

    await sendEmail({
      to,
      subject: `💰 ${name} paid ${amount} - ${a.what}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
          <h2 style="margin:0 0 12px;color:#0d7377">💰 ${escapeHtml(label)}: ${escapeHtml(amount)}</h2>
          <table style="width:100%;border-collapse:collapse">
            ${row("Church", escapeHtml(name))}
            ${row("For", escapeHtml(a.what))}
            ${row("Amount", escapeHtml(amount))}
            ${a.provider ? row("Gateway", escapeHtml(a.provider)) : ""}
            ${a.reference ? row("Reference", escapeHtml(a.reference), true) : ""}
            ${row("When", escapeHtml(when))}
          </table>
          <p style="margin-top:20px;color:#999;font-size:12px">You get this because you are the WorshipHQ platform owner. It is not sent to any church.</p>
        </div>`,
    });
  } catch (e) {
    console.error("[alertOwnerPayment]", (e as Error).message);
  }
}

/**
 * Tell the platform owner the live USD→GHS rate feed has gone quiet. Called once a day, from the daily
 * automations cron only, by checkFxStaleness() in src/lib/integrations/fx.ts - so this can fire at most
 * once per day while the problem stays unresolved, never more. Not sent to any church.
 */
export async function alertOwnerStaleFx(hoursSince: number | null): Promise<void> {
  try {
    const to = ownerAlertRecipients();
    if (!to.length) return;
    const since = hoursSince != null ? `${Math.round(hoursSince)} hours` : "an unknown time - it has never fetched successfully";

    await sendEmail({
      to,
      subject: `⚠️ WorshipHQ's exchange rate hasn't updated in ${hoursSince != null ? `${Math.round(hoursSince)}h` : "a long time"}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
          <h2 style="margin:0 0 12px;color:#b45309">⚠️ The exchange rate feed looks stuck</h2>
          <p>WorshipHQ prices plans in USD but charges in GHS, using a rate it fetches automatically every 6 hours. That rate hasn&rsquo;t actually updated in <b>${escapeHtml(since)}</b>.</p>
          <p>This usually means the free FX source is down or something is blocking the refresh. Until it&rsquo;s fixed, churches may be charged using an outdated rate. Check <code>/admin/pricing</code> (it shows the current rate) and the server logs.</p>
          <p style="margin-top:20px;color:#999;font-size:12px">You get this once a day while it stays stuck. Nothing is sent to any church about this.</p>
        </div>`,
    });
  } catch (e) {
    console.error("[alertOwnerStaleFx]", (e as Error).message);
  }
}
