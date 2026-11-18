import "server-only";
import { LIVE_CHURCH } from "@/lib/live-church";
import { db } from "@/lib/db";
import { onlyWithFeature } from "@/lib/plan-gate-batch";
import { sendChurchSms } from "@/lib/sms/credits";
import { renderTemplate, templateFor } from "@/lib/messages/registry";
import { localParts } from "@/lib/time/tz";
import type { Deadline } from "@/lib/automations/pool";

/** Members who checked in and can be thanked: active, not a child, with a phone, and not already thanked today. */
const SAME_DAY_MS = 14 * 3600_000;

type Church = { thankAfterService: boolean; thankServiceNames: string[]; thankOtherPrograms: boolean };

/** Should "thank everyone" be ticked by default when this service is ended? */
export function thankDefault(church: Church, session: { serviceName: string; slotId: string | null }): boolean {
  if (!church.thankAfterService) return false;
  const name = session.serviceName.trim().toLowerCase();
  if (church.thankServiceNames.some((n) => n.trim().toLowerCase() === name)) return true;
  // A one-off program (not opened from a regular service time) follows the "other programs" choice.
  return !session.slotId && church.thankOtherPrograms;
}

async function eligible(sessionId: string, churchId: string) {
  const records = await db.attendanceRecord.findMany({
    where: {
      sessionId, churchId, personId: { not: null }, thankedAt: null,
      person: { status: { in: ["active", "visitor"] }, phone: { not: null }, AND: [{ OR: [{ ageGroup: null }, { ageGroup: { not: "child" } }] }] },
    },
    select: { id: true, personId: true, person: { select: { id: true, firstName: true, phone: true, lastThankedAt: true, status: true } } },
  });
  // A first-time visitor already gets their own welcome; only visitors who have been before are welcomed back here.
  const visitorIds = records.filter((r) => r.person?.status === "visitor").map((r) => r.personId!);
  const returning = new Set(
    visitorIds.length
      ? (await db.visitor.findMany({ where: { personId: { in: visitorIds }, visitCount: { gte: 2 } }, select: { personId: true } })).map((v) => v.personId!)
      : [],
  );
  const cutoff = Date.now() - SAME_DAY_MS;
  const seen = new Set<string>();
  const out: typeof records = [];
  const skip: string[] = [];
  // People locked by the plan's member limit are not texted.
  const { lockedPersonIds } = await import("@/lib/member-lock");
  const locked = await lockedPersonIds(churchId);
  for (const r of records) {
    if (!r.person?.phone || !r.personId) continue;
    if (locked.has(r.personId)) { skip.push(r.id); continue; }
    if (r.person.status === "visitor" && !returning.has(r.personId)) { skip.push(r.id); continue; }
    if (seen.has(r.personId) || (r.person.lastThankedAt && r.person.lastThankedAt.getTime() > cutoff)) { skip.push(r.id); continue; }
    seen.add(r.personId);
    out.push(r);
  }
  return { out, skip };
}

/** How many people would get the thank-you if it were sent now (for the cost line in the End service dialog). */
export async function countThankRecipients(sessionId: string, churchId: string): Promise<number> {
  return (await eligible(sessionId, churchId)).out.length;
}

/**
 * Text "thank you for coming" to everyone who checked in, within a time budget. Anyone left over is sent by the next
 * call (the page keeps going until everyone is done) or by the hourly run.
 *
 * Sent in batches through sendChurchSms's personal-text mode (several at a time, one credit check per batch). Sending
 * one person at a time took about 5 seconds each, so a press only reached 4 people before its time ran out (Nov 2026).
 * Each batch is CLAIMED before it is sent (thankedAt set first, put back for any that fail), so a second press, the
 * hourly run, or a request cut off half way can never text the same person twice.
 */
const THANKS_BATCH = 10;
export async function sendServiceThanks(sessionId: string, opts: { budgetMs?: number } = {}) {
  const t0 = Date.now();
  const sess = await db.attendanceSession.findUnique({
    where: { id: sessionId },
    select: { id: true, churchId: true, serviceName: true, church: { select: { name: true, isDemo: true, messageTemplates: true } } },
  });
  if (!sess || sess.church.isDemo) return { sent: 0, remaining: 0, insufficient: false };

  const { out, skip } = await eligible(sess.id, sess.churchId);
  if (skip.length) await db.attendanceRecord.updateMany({ where: { id: { in: skip } }, data: { thankedAt: new Date() } });

  const template = templateFor(sess.church.messageTemplates, "service_thanks");
  const backTemplate = templateFor(sess.church.messageTemplates, "service_welcome_back");
  const stop = t0 + (opts.budgetMs ?? 8_000);
  let sent = 0;
  let handled = 0;
  let insufficient = false;
  for (let i = 0; i < out.length; i += THANKS_BATCH) {
    // A batch takes a few seconds; do not start one that would run past the budget.
    if (i > 0 && Date.now() + 5_000 >= stop) break;
    const want = out.slice(i, i + THANKS_BATCH);
    const claim = new Date();
    await db.attendanceRecord.updateMany({ where: { id: { in: want.map((r) => r.id) }, thankedAt: null }, data: { thankedAt: claim } });
    const mine = new Set((await db.attendanceRecord.findMany({ where: { id: { in: want.map((r) => r.id) }, thankedAt: claim }, select: { id: true } })).map((r) => r.id));
    const batch = want.filter((r) => mine.has(r.id));
    handled += want.length;
    if (batch.length === 0) continue;

    const textFor = (k: number) => renderTemplate(batch[k]!.person!.status === "visitor" ? backTemplate : template, { name: batch[k]!.person!.firstName, church: sess.church.name, service: sess.serviceName });
    const res = await sendChurchSms(sess.churchId, batch.map((r) => r.person!.phone!), textFor(0), { note: "Thank you after service", textFor });
    const okIdx = new Set<number>();
    (res.results ?? []).forEach((r, k) => { if (r.ok) okIdx.add(k); });
    const failed = batch.filter((_, k) => !okIdx.has(k)).map((r) => r.id);
    // Out of credits: hand those back so they go out after a top-up. Any other failure (a bad number the carrier
    // refused) stays marked, so it is not retried, and charged nothing, on every press and every hour.
    if (res.insufficient && failed.length) await db.attendanceRecord.updateMany({ where: { id: { in: failed } }, data: { thankedAt: null } });
    const okPeople = batch.filter((_, k) => okIdx.has(k)).map((r) => r.person!.id);
    if (okPeople.length) await db.person.updateMany({ where: { id: { in: okPeople } }, data: { lastThankedAt: new Date() } });
    sent += okPeople.length;
    if (res.insufficient) { insufficient = true; handled -= failed.length; break; }
  }
  if (sent) await db.attendanceSession.update({ where: { id: sess.id }, data: { thankSentCount: { increment: sent } } });
  return { sent, remaining: Math.max(0, out.length - handled), insufficient };
}

/** Hourly: finish any thank-you texts that did not all go out when the service was ended (time ran out, or credits). */
export async function runServiceThanks(now = new Date(), ignoreHour = false, deadline?: Deadline) {
  const since = new Date(now.getTime() - 3 * 86400_000);
  const sessions = await db.attendanceSession.findMany({
    where: { thankRequested: true, endedAt: { gte: since }, church: LIVE_CHURCH },
    select: { id: true, churchId: true, church: { select: { timezone: true } } },
    orderBy: { endedAt: "asc" },
    take: 40,
  });
  // Thank-you texts are a Communications feature: a church that has dropped below it stops getting them.
  const okChurches = new Set(
    (await onlyWithFeature([...new Set(sessions.map((s) => s.churchId))].map((id) => ({ id })), "sms")).map((c) => c.id),
  );
  let sent = 0;
  for (const s of sessions) {
    if (!okChurches.has(s.churchId)) continue;
    if (deadline !== undefined && Date.now() >= deadline) break;
    if (!ignoreHour) {
      const { hour } = localParts(now, s.church.timezone);
      if (hour < 8 || hour >= 20) continue;
    }
    const budget = deadline !== undefined ? Math.max(0, Math.min(8_000, deadline - Date.now())) : 8_000;
    const r = await sendServiceThanks(s.id, { budgetMs: budget });
    sent += r.sent;
  }
  return { sessions: sessions.length, sent };
}
