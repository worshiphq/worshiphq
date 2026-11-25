import "server-only";
import { db } from "@/lib/db";
import { LIVE_CHURCH } from "@/lib/live-church";
import { onlyWithFeature } from "@/lib/plan-gate-batch";
import { sendOutreach, type OutreachResult } from "@/lib/outreach/send";

/**
 * Churches whose texts are being held back because their SMS credits ran out.
 *
 * One automatic email per run-out: it goes after a message was really blocked, and never again until the church has
 * topped up and run out again. Anything more is a button in SuperAdmin, SMS records.
 */
export const LOW_CREDITS = 20;
export const CREDITS_TEMPLATE = "credits-low";
const BLOCKED = "Not enough SMS credits";
const DAY = 86_400_000;
/** The automatic email only answers a recent block; the SuperAdmin list looks further back. */
const AUTO_DAYS = 3;
const LIST_DAYS = 30;
const MAX_PER_RUN = 20;

export type OutOfCreditsChurch = {
  id: string; name: string; credits: number; plan: string; country: string; city: string | null;
  /** Sends and texts held back since the last top-up (within the window), and when the last one was. */
  blockedSends: number; blockedTexts: number; lastBlocked: string;
  contact: { userId: string; name: string; email: string } | null;
  lastEmail: { at: string; auto: boolean; ok: boolean } | null;
  /** Marks this run-out: the last time credits were added. */
  episode: string;
};

export async function churchesOutOfCredits(days = LIST_DAYS): Promise<OutOfCreditsChurch[]> {
  const rows = await db.smsAuditLog.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - days * DAY) },
      numbers: { contains: BLOCKED },
      church: { ...LIVE_CHURCH, suspended: false, deletionRequestedAt: null, smsCredits: { lte: LOW_CREDITS } },
    },
    select: { churchId: true, recipients: true, sent: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const ids = [...new Set(rows.map((r) => r.churchId))];
  // A church whose plan has no SMS cannot buy credits, so asking it to top up would only confuse it.
  const allowed = (await onlyWithFeature(ids.map((id) => ({ id })), "sms")).map((c) => c.id);
  if (allowed.length === 0) return [];

  const [churches, topups, emails] = await Promise.all([
    db.church.findMany({
      where: { id: { in: allowed } },
      select: {
        id: true, name: true, smsCredits: true, country: true, city: true, subscription: { select: { plan: true } },
        users: { where: { role: { in: ["Owner", "Admin"] } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, role: true } },
      },
    }),
    db.smsTransaction.groupBy({ by: ["churchId"], where: { churchId: { in: allowed }, kind: { in: ["topup", "bonus"] }, credits: { gt: 0 } }, _max: { createdAt: true } }),
    db.outreachMessage.findMany({ where: { churchId: { in: allowed }, channel: "email", template: CREDITS_TEMPLATE }, orderBy: { createdAt: "desc" }, select: { churchId: true, createdAt: true, auto: true, status: true } }),
  ]);
  const topped = new Map(topups.map((t) => [t.churchId, t._max.createdAt]));

  return churches.flatMap((c) => {
    const since = topped.get(c.id) ?? null;
    const blocked = rows.filter((r) => r.churchId === c.id && (!since || r.createdAt > since));
    if (blocked.length === 0) return [];
    const users = [...c.users].sort((a, b) => (a.role === "Owner" ? 0 : 1) - (b.role === "Owner" ? 0 : 1));
    const to = users.find((u) => u.email);
    const mail = emails.find((e) => e.churchId === c.id);
    return [{
      id: c.id, name: c.name, credits: c.smsCredits, plan: c.subscription?.plan ?? "free", country: c.country?.trim() || "Country not set", city: c.city?.trim() || null,
      blockedSends: blocked.length,
      blockedTexts: blocked.reduce((a, r) => a + Math.max(0, r.recipients - r.sent), 0),
      lastBlocked: blocked[0]!.createdAt.toISOString(),
      contact: to ? { userId: to.id, name: to.name, email: to.email } : null,
      lastEmail: mail ? { at: mail.createdAt.toISOString(), auto: mail.auto, ok: mail.status === "sent" } : null,
      episode: since ? String(since.getTime()) : "start",
    }];
  }).sort((a, b) => b.lastBlocked.localeCompare(a.lastBlocked));
}

/** The one automatic email for each run-out. Runs with the scheduled jobs, in the daytime only. */
export async function runCreditAlerts(now = new Date()) {
  const summary = { waiting: 0, emailed: 0, failed: 0 };
  const hour = now.getUTCHours();
  if (hour < 7 || hour >= 20) return summary;
  const list = (await churchesOutOfCredits(AUTO_DAYS)).filter((c) => {
    if (!c.contact) return false;
    // Already told about this run-out, by the timer or by hand.
    if (c.lastEmail && (c.episode === "start" || Date.parse(c.lastEmail.at) > Number(c.episode))) return false;
    // Someone who tops up a little at a time is not emailed about every small run-out.
    return !c.lastEmail || now.getTime() - Date.parse(c.lastEmail.at) > 7 * DAY;
  });
  summary.waiting = list.length;
  for (const c of list.slice(0, MAX_PER_RUN)) {
    const recordId = `credits-${c.id}-${c.episode}`;
    try {
      // The id is the claim: two runs at the same moment cannot both create it, so only one email goes.
      await db.outreachMessage.create({
        data: { id: recordId, churchId: c.id, userId: c.contact!.userId, toName: c.contact!.name, to: c.contact!.email, channel: "email", template: CREDITS_TEMPLATE, body: "", status: "failed", error: "Not finished", auto: true },
      });
    } catch {
      continue;
    }
    const r = await sendOutreach({ churchId: c.id, userId: c.contact!.userId, channel: "email", template: CREDITS_TEMPLATE, auto: true, recordId }).catch(() => ({ ok: false }) as OutreachResult);
    if (r.ok) summary.emailed++; else summary.failed++;
  }
  return summary;
}
