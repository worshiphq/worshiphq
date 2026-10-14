import "server-only";
import { db } from "@/lib/db";
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
  for (const r of records) {
    if (!r.person?.phone || !r.personId) continue;
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
 * Text "thank you for coming" to everyone who checked in. One by one (credits are checked and used per church, so
 * sends must not overlap), within a time budget. Anyone left over is finished by the next hourly run.
 */
export async function sendServiceThanks(sessionId: string, opts: { budgetMs?: number } = {}) {
  const sess = await db.attendanceSession.findUnique({
    where: { id: sessionId },
    select: { id: true, churchId: true, serviceName: true, church: { select: { name: true, isDemo: true, messageTemplates: true } } },
  });
  if (!sess || sess.church.isDemo) return { sent: 0, remaining: 0, insufficient: false };

  const { out, skip } = await eligible(sess.id, sess.churchId);
  if (skip.length) await db.attendanceRecord.updateMany({ where: { id: { in: skip } }, data: { thankedAt: new Date() } });

  const template = templateFor(sess.church.messageTemplates, "service_thanks");
  const backTemplate = templateFor(sess.church.messageTemplates, "service_welcome_back");
  const stop = Date.now() + (opts.budgetMs ?? 20_000);
  let sent = 0;
  let insufficient = false;
  for (const r of out) {
    if (Date.now() >= stop) break;
    const msg = renderTemplate(r.person!.status === "visitor" ? backTemplate : template, { name: r.person!.firstName, church: sess.church.name, service: sess.serviceName });
    const res = await sendChurchSms(sess.churchId, r.person!.phone!, msg, { note: "Thank you after service" });
    if (res.insufficient) { insufficient = true; break; }
    if (res.ok) {
      sent++;
      const now = new Date();
      await db.attendanceRecord.update({ where: { id: r.id }, data: { thankedAt: now } });
      await db.person.update({ where: { id: r.person!.id }, data: { lastThankedAt: now } });
    }
  }
  if (sent) await db.attendanceSession.update({ where: { id: sess.id }, data: { thankSentCount: { increment: sent } } });
  return { sent, remaining: Math.max(0, out.length - sent), insufficient };
}

/** Hourly: finish any thank-you texts that did not all go out when the service was ended (time ran out, or credits). */
export async function runServiceThanks(now = new Date(), ignoreHour = false, deadline?: Deadline) {
  const since = new Date(now.getTime() - 3 * 86400_000);
  const sessions = await db.attendanceSession.findMany({
    where: { thankRequested: true, endedAt: { gte: since }, church: { isDemo: false } },
    select: { id: true, church: { select: { timezone: true } } },
    orderBy: { endedAt: "asc" },
    take: 40,
  });
  let sent = 0;
  for (const s of sessions) {
    if (deadline !== undefined && Date.now() >= deadline) break;
    if (!ignoreHour) {
      const { hour } = localParts(now, s.church.timezone);
      if (hour < 8 || hour >= 20) continue;
    }
    const budget = deadline !== undefined ? Math.max(0, Math.min(25_000, deadline - Date.now())) : 25_000;
    const r = await sendServiceThanks(s.id, { budgetMs: budget });
    sent += r.sent;
  }
  return { sessions: sessions.length, sent };
}
