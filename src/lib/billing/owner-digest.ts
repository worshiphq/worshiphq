import "server-only";
import { sendEmail } from "@/lib/integrations/email";
import { sendSms } from "@/lib/integrations/sms";
import { escapeHtml } from "@/lib/html";
import { ownerAlertRecipients } from "@/lib/billing/owner-alert";
import { getAlertPhone } from "@/lib/outreach/owner-alert";
import { env } from "@/lib/env";

/**
 * One message to the platform owner about renewals, however many churches are involved.
 *
 * Six churches renewing within three days must not mean six texts: they arrive as ONE email (the full
 * list) and ONE short text (the headline). It goes out only when there is something NEW to say today, a
 * church entering its last week, an expiry, a lapse or a failed automatic charge, so a quiet day sends
 * nothing and a church is announced once per renewal, not every day it stays in the window.
 *
 * Owner only. It is deliberately not sent to the partner.
 */

export type RenewalRow = {
  churchId: string;
  name: string;
  plan: string;
  interval: string;
  renewsAt: Date;
  daysLeft: number;
  auto: boolean;
  priceGhs: number;
  /** First time the owner is being told about this renewal. */
  isNew: boolean;
};

export type DigestInput = {
  upcoming: RenewalRow[];
  newlyExpired: { name: string; plan: string }[];
  newlyLapsed: { name: string; plan: string }[];
  autoFailed: { name: string; reason: string }[];
  autoRenewed: { name: string; amountGhs: number }[];
};

/**
 * A church coming within this many days of renewing is what TRIGGERS a message...
 */
export const OWNER_TRIGGER_DAYS = 7;
/**
 * ...but the message then covers everything renewing within this many days, and marks all of it as told.
 * Churches that renew a day or two apart (they usually do: people sign up in waves) therefore arrive as
 * ONE message instead of one a day. The window is wider than the trigger on purpose.
 */
export const OWNER_GROUP_DAYS = 10;

export const digestHasNews = (d: DigestInput) =>
  d.upcoming.some((r) => r.isNew && r.daysLeft <= OWNER_TRIGGER_DAYS) || d.newlyExpired.length > 0 || d.newlyLapsed.length > 0 || d.autoFailed.length > 0;

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const cedi = (n: number) => `₵${Math.round(n).toLocaleString("en-GB")}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function digestSms(d: DigestInput): string {
  const up = [...d.upcoming].sort((a, b) => a.renewsAt.getTime() - b.renewsAt.getTime());
  const parts: string[] = [];
  if (up.length) {
    const total = up.reduce((s, r) => s + r.priceGhs, 0);
    const range = up.length > 1 && day(up[0].renewsAt) !== day(up[up.length - 1].renewsAt) ? `${day(up[0].renewsAt)} to ${day(up[up.length - 1].renewsAt)}` : day(up[0].renewsAt);
    parts.push(`${plural(up.length, "church", "churches")} renew ${up.length === 1 ? `on ${range}` : `${range}`} (about ${cedi(total)})`);
  }
  if (d.newlyExpired.length) parts.push(`${d.newlyExpired.length} expired`);
  if (d.newlyLapsed.length) parts.push(`${d.newlyLapsed.length} dropped to Free`);
  if (d.autoFailed.length) parts.push(`${d.autoFailed.length} card ${d.autoFailed.length === 1 ? "charge" : "charges"} failed`);
  return `WorshipHQ renewals: ${parts.join(". ")}. Full list in your email, or /admin/renewals.`;
}

export function digestHtml(d: DigestInput): string {
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/admin/renewals`;
  const up = [...d.upcoming].sort((a, b) => a.renewsAt.getTime() - b.renewsAt.getTime());
  const total = up.reduce((s, r) => s + r.priceGhs, 0);
  const cell = "padding:8px 10px;border-bottom:1px solid #eee;font-size:14px";

  const upcoming = up.length
    ? `<h3 style="margin:22px 0 8px">Renewing soon · about ${escapeHtml(cedi(total))}</h3>
       <table style="width:100%;border-collapse:collapse">
         <tr style="text-align:left;color:#888;font-size:12px"><th style="${cell}">Church</th><th style="${cell}">Plan</th><th style="${cell}">Renews</th><th style="${cell}">Expected</th></tr>
         ${up.map((r) => `<tr>
           <td style="${cell};font-weight:600">${escapeHtml(r.name)}${r.isNew ? "" : ' <span style="color:#999;font-weight:400;font-size:12px">(told you earlier)</span>'}</td>
           <td style="${cell};text-transform:capitalize">${escapeHtml(r.plan)} ${escapeHtml(r.interval)}</td>
           <td style="${cell}">${escapeHtml(day(r.renewsAt))} (${r.daysLeft <= 0 ? "today" : plural(r.daysLeft, "day")})</td>
           <td style="${cell}">${escapeHtml(cedi(r.priceGhs))}${r.auto ? ' <span style="color:#0d7377;font-size:12px">card on file</span>' : ""}</td>
         </tr>`).join("")}
       </table>
       <p style="color:#888;font-size:12px;margin:6px 0 0">"Card on file" churches renew by themselves. The rest have been reminded and must pay.</p>`
    : "";

  const list = (title: string, color: string, rows: string[]) =>
    rows.length ? `<h3 style="margin:22px 0 6px;color:${color}">${escapeHtml(title)}</h3><ul style="margin:0;padding-left:18px">${rows.map((r) => `<li style="margin:3px 0">${r}</li>`).join("")}</ul>` : "";

  return `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;color:#1c1a16">
      <h2 style="margin:0 0 4px;color:#0d7377">Renewals</h2>
      <p style="margin:0;color:#666">${escapeHtml(new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }))}</p>
      ${upcoming}
      ${list("Failed automatic charges", "#b45309", d.autoFailed.map((f) => `<b>${escapeHtml(f.name)}</b>: ${escapeHtml(f.reason)}`))}
      ${list("Expired, now in their 7-day grace", "#b45309", d.newlyExpired.map((e) => `<b>${escapeHtml(e.name)}</b> (${escapeHtml(e.plan)})`))}
      ${list("Dropped to the Free plan", "#b91c1c", d.newlyLapsed.map((e) => `<b>${escapeHtml(e.name)}</b> (was ${escapeHtml(e.plan)})`))}
      ${list("Renewed automatically today", "#15966b", d.autoRenewed.map((e) => `<b>${escapeHtml(e.name)}</b> · ${escapeHtml(cedi(e.amountGhs))}`))}
      <p style="margin:26px 0"><a href="${url}" style="background:#0d7377;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Open the renewals page</a></p>
      <p style="color:#999;font-size:12px">You are the only person who gets this. One message per day at most, and only when something is new.</p>
    </div>`;
}

/** Send the digest by email and text. Returns whether at least one reached the owner. Never throws. */
export async function sendOwnerDigest(d: DigestInput): Promise<{ delivered: boolean; email: boolean; sms: boolean }> {
  let email = false;
  let sms = false;
  try {
    const to = ownerAlertRecipients();
    if (to.length) {
      const subjectBits = [
        d.upcoming.length ? `${plural(d.upcoming.length, "renewal")} this week` : "",
        d.newlyExpired.length ? `${d.newlyExpired.length} expired` : "",
        d.newlyLapsed.length ? `${d.newlyLapsed.length} lapsed` : "",
        d.autoFailed.length ? `${d.autoFailed.length} card failed` : "",
      ].filter(Boolean);
      const res = await sendEmail({ to, subject: `WorshipHQ: ${subjectBits.join(", ")}`, html: digestHtml(d) });
      email = !!res.ok;
    }
  } catch (e) {
    console.error("[owner digest email]", (e as Error).message);
  }
  try {
    const { phone } = await getAlertPhone();
    if (phone) sms = !!(await sendSms(phone, digestSms(d), { heading: null })).ok;
  } catch (e) {
    console.error("[owner digest sms]", (e as Error).message);
  }
  return { delivered: email || sms, email, sms };
}
