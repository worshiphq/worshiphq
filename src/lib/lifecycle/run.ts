import "server-only";
import { db } from "@/lib/db";
import { LIVE_CHURCH } from "@/lib/live-church";
import { brand } from "@/config/brand";
import { sendEmail, emailRoomToday } from "@/lib/integrations/email";
import { renderEmailHtml, firstName } from "@/lib/outreach/templates";
import { outreachContact } from "@/lib/outreach/send";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { paidPlan } from "@/lib/plan-gate";
import { signToken } from "@/lib/auth/tokens";
import { ttlCached } from "@/lib/ttl-cache";
import { CHURCH_STEP_ORDER, STEPS, fill, stepApplies, stepById, type ChurchFacts, type LiveNumbers, type StepId } from "./steps";

/**
 * Runs the automatic email sequence. Called from the scheduled automations: it only sends between 07:00 and 10:59
 * Ghana time (UTC), never on a Sunday, at most `perRun` emails a run and `dailyCap` a day, and it stops early when
 * the email senders together (Brevo + Resend) are close to their daily limits, so sign-in codes and receipts always have room.
 */

const DAY = 86_400_000;
const GAP_MS = 2 * DAY; // at most one sequence email per church every 2 days
// Stop sending tips when only this many emails are left today across ALL senders (Brevo + Resend), so sign-in codes
// and receipts always have room. It used to stop at 200 through Brevo alone and never used the Resend backup.
const KEEP_FOR_ESSENTIALS = 60;

export type SequenceSettings = { enabled: boolean; dailyCap: number; steps: Record<string, boolean> };
export const DEFAULT_SETTINGS: SequenceSettings = { enabled: false, dailyCap: 80, steps: Object.fromEntries(STEPS.map((s) => [s.id, true])) };

export function readSettings(raw: unknown): SequenceSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<SequenceSettings>;
  const cap = Number(r.dailyCap);
  return {
    enabled: r.enabled === true,
    dailyCap: Number.isFinite(cap) ? Math.max(0, Math.min(1000, Math.round(cap))) : DEFAULT_SETTINGS.dailyCap,
    steps: { ...DEFAULT_SETTINGS.steps, ...(r.steps && typeof r.steps === "object" ? r.steps : {}) },
  };
}

export async function getSequenceSettings(): Promise<SequenceSettings> {
  const row = await db.platformConfig.findUnique({ where: { id: "default" }, select: { lifecycleSettings: true } });
  return readSettings(row?.lifecycleSettings);
}

/** The live plan numbers the emails quote, so an email never states an old price or limit. */
export async function liveNumbers(): Promise<LiveNumbers> {
  const cfg = await getPlatformConfig();
  const free = cfg.planDefs.free;
  const starter = cfg.planDefs.starter;
  const monthly = starter.ghsMonthly || Math.round(starter.monthly * cfg.usdToGhsRate);
  const yearly = starter.ghsYearly || Math.round(starter.yearly * cfg.usdToGhsRate);
  const t = cfg.trials;
  // Only promise a trial the church can start itself: trials on, Starter trials on, and self-start on.
  const trial = t.enabled && t.steps.starter && t.auto.enabled ? { days: t.days, minMembers: t.auto.minMembers, minDays: t.auto.minDays } : null;
  return {
    freeLimit: free.memberLimit,
    starterLimit: starter.memberLimit,
    starterMonthly: monthly,
    starterYearly: yearly,
    starterFeatures: (starter.marketingFeatures ?? []).filter((f) => !/^everything in/i.test(f)).slice(0, 7),
    trial,
  };
}

const money = (n: number) => n.toLocaleString("en-GH", { maximumFractionDigits: 2 });

/** Every field an email can use, for one church (or a sign-up with no church yet). */
export function mergeData(live: LiveNumbers, x: { name: string; church: string; slug?: string; facts?: ChurchFacts; resume?: string }): Record<string, string> {
  const saving = Math.max(0, live.starterMonthly * 12 - live.starterYearly);
  const absent = x.facts?.lastSunday?.absent ?? 0;
  return {
    // "KWAKU" reads as shouting: a name typed all in capitals is greeted as "Kwaku".
    name: ((n) => (n === n.toUpperCase() && /[A-Z]/.test(n) ? n.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase()) : n))(firstName(x.name)),
    church: x.church,
    members: String(x.facts?.members ?? 0),
    freeLimit: live.freeLimit > 0 ? String(live.freeLimit) : "unlimited",
    starterLimit: live.starterLimit > 0 ? money(live.starterLimit) : "unlimited",
    starterMonthly: money(live.starterMonthly),
    starterYearly: money(live.starterYearly),
    yearlySaving: money(saving),
    starterFeatures: live.starterFeatures.map((f) => `- ${f}`).join("\n"),
    trialLine: live.trial && x.facts && x.facts.members >= live.trial.minMembers && x.facts.ageDays >= live.trial.minDays
      ? `\n\nNot sure yet? Try Starter free for ${live.trial.days} days first, from Settings, Billing.`
      : "",
    // Nearly full, or already full (a church can be over the limit if it grew before the limit changed).
    limitSubject: (x.facts?.members ?? 0) >= live.freeLimit
      ? `${x.church} has reached the free plan's ${live.freeLimit} members`
      : `${x.church} has ${x.facts?.members ?? 0} of ${live.freeLimit} free members`,
    limitPara: (x.facts?.members ?? 0) >= live.freeLimit
      ? `Good news: ${x.church} has grown to ${x.facts?.members ?? 0} members on WorshipHQ. That is the most the free plan holds, so new members cannot be added until you upgrade. Everyone you already have stays, and nothing is lost.`
      : `Good news: ${x.church} now has ${x.facts?.members ?? 0} members on WorshipHQ. The free plan holds up to ${live.freeLimit}, so you are nearly full. When you reach ${live.freeLimit}, new members cannot be added on the free plan. Everyone you already have stays, and nothing is lost.`,
    present: String(x.facts?.lastSunday?.present ?? 0),
    absentLine: absent > 0
      ? `${absent} of your members were not there. On WorshipHQ you can see exactly who they are, so someone can call or text them this week.`
      : "Every member you have on WorshipHQ was there. That is a Sunday to be thankful for.",
    joinLink: x.slug ? `${brand.url}/join/${x.slug}` : `${brand.url}/app/people`,
    resume: x.resume ?? "",
  };
}

/** Builds one email, ready to send. Used by the run, the preview and "send me a test". */
export function buildEmail(stepId: StepId, data: Record<string, string>, unsubscribeUrl?: string, forSignup = false) {
  const step = stepById(stepId)!;
  const subject = fill(step.subject, data);
  const body = fill(step.body, data).replace(/\n{3,}/g, "\n\n").trim();
  const html = renderEmailHtml({
    subject,
    body,
    church: data.church,
    contact: outreachContact(),
    button: { label: fill(step.button.label, data), href: `${brand.url}${fill(step.button.path, data)}` },
    reason: forSignup ? "you started creating an account on WorshipHQ" : undefined,
    unsubscribeUrl,
  });
  return { subject, body, html };
}

export const unsubscribeUrl = (email: string) => `${brand.url}/email-preferences?t=${encodeURIComponent(signToken("email-optout", { e: email.toLowerCase() }, 3 * 365 * DAY))}`;
const resumeToken = (vid: string) => signToken("signup-resume", { v: vid }, 30 * DAY);

/** The most recent Sunday before today, as a UTC day [start, end). */
function lastSundayRange(now: Date): { start: Date; end: Date; label: string } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const back = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const start = new Date(d.getTime() - back * DAY);
  return { start, end: new Date(start.getTime() + DAY), label: start.toISOString().slice(0, 10) };
}

type Candidate =
  | { kind: "signup"; email: string; name: string; church: string; vid: string }
  | { kind: "church"; email: string; name: string; churchId: string; church: string; slug: string; step: StepId; facts: ChurchFacts };

/** Works out who is due which email right now. Read-only: the run and the SuperAdmin page both use it. */
export async function dueEmails(now = new Date(), settings?: SequenceSettings): Promise<{ list: Candidate[]; live: LiveNumbers }> {
  const s = settings ?? (await getSequenceSettings());
  const live = await liveNumbers();
  const weekday = now.getUTCDay();
  const list: Candidate[] = [];
  const optedOut = new Set((await db.emailOptOut.findMany({ select: { email: true } })).map((r) => r.email));

  // 1) Unfinished sign-ups: hottest leads, so they go first.
  if (s.steps["finish-signup"] !== false) {
    const rows = await db.phoneVerification.findMany({
      where: { purpose: "signup", createdAt: { gte: new Date(now.getTime() - 30 * DAY), lte: new Date(now.getTime() - 2 * 3_600_000) } },
      orderBy: { createdAt: "desc" },
      select: { id: true, payload: true },
    });
    const byEmail = new Map<string, { vid: string; name: string; church: string }>();
    for (const r of rows) {
      const p = (r.payload ?? {}) as { email?: string; name?: string; churchName?: string };
      const email = String(p.email ?? "").toLowerCase().trim();
      if (!/^\S+@\S+\.\S+$/.test(email) || byEmail.has(email)) continue;
      byEmail.set(email, { vid: r.id, name: String(p.name ?? ""), church: String(p.churchName ?? "your church") });
    }
    const emails = [...byEmail.keys()];
    if (emails.length) {
      const [users, sent] = await Promise.all([
        db.user.findMany({ where: { email: { in: emails } }, select: { email: true } }),
        db.lifecycleSend.findMany({ where: { email: { in: emails }, step: "finish-signup" }, select: { email: true } }),
      ]);
      const skip = new Set([...users.map((u) => u.email), ...sent.map((x) => x.email)]);
      for (const [email, v] of byEmail) if (!skip.has(email) && !optedOut.has(email)) list.push({ kind: "signup", email, ...v });
    }
  }

  // 2) Churches. Never on a Sunday.
  if (weekday !== 0) {
    const churches = await db.church.findMany({
      where: { ...LIVE_CHURCH, suspended: false },
      select: { id: true, name: true, slug: true, createdAt: true, subscription: { select: { plan: true, status: true, renewsAt: true } } },
    });
    const since14 = new Date(now.getTime() - 14 * DAY);
    const sun = lastSundayRange(now);
    // No long "churchId in (...)" lists: each query groups the whole table once, and the churches loop below only
    // looks up the ones it needs. Run two at a time so a small connection pool is never queued up.
    const pair = async <A, B>(a: () => Promise<A>, b: () => Promise<B>) => Promise.all([a(), b()]);
    const [owners, members] = await pair(
      () => db.user.findMany({ where: { role: "Owner", church: LIVE_CHURCH }, orderBy: { createdAt: "asc" }, select: { churchId: true, email: true, name: true } }),
      () => db.person.groupBy({ by: ["churchId"], where: { status: "active" }, _count: true }),
    );
    const [attendance, sundayRows] = await pair(
      () => db.attendanceRecord.groupBy({ by: ["churchId"], _count: true, _max: { date: true } }),
      () => db.attendanceRecord.groupBy({ by: ["churchId"], where: { date: { gte: sun.start, lt: sun.end } }, _count: true }),
    );
    const [sends, audit] = await pair(
      () => db.lifecycleSend.findMany({ where: { churchId: { not: null } }, select: { churchId: true, step: true, sentAt: true } }),
      () => db.auditLog.groupBy({ by: ["churchId"], where: { createdAt: { gte: since14 } } }),
    );
    const [gifts, sms] = await pair(
      () => db.gift.groupBy({ by: ["churchId"], where: { date: { gte: since14 } } }),
      () => db.smsTransaction.groupBy({ by: ["churchId"], where: { kind: "usage", createdAt: { gte: since14 } } }),
    );
    const owner = new Map<string, { email: string; name: string }>();
    for (const o of owners) if (!owner.has(o.churchId)) owner.set(o.churchId, { email: o.email.toLowerCase(), name: o.name });
    const memberN = new Map(members.map((m) => [m.churchId, m._count]));
    const att = new Map(attendance.map((a) => [a.churchId, { n: a._count, last: a._max.date }]));
    const sunday = new Map(sundayRows.map((r) => [r.churchId, r._count]));
    const active = new Set([...audit, ...gifts, ...sms].map((r) => r.churchId));
    for (const [cid, a] of att) if (a.last && a.last >= since14) active.add(cid);
    const sentSteps = new Map<string, Set<string>>();
    const lastSent = new Map<string, number>();
    for (const x of sends) {
      if (!x.churchId) continue;
      (sentSteps.get(x.churchId) ?? sentSteps.set(x.churchId, new Set()).get(x.churchId)!).add(x.step);
      lastSent.set(x.churchId, Math.max(lastSent.get(x.churchId) ?? 0, x.sentAt.getTime()));
    }

    for (const c of churches) {
      const o = owner.get(c.id);
      if (!o || optedOut.has(o.email)) continue;
      if (now.getTime() - (lastSent.get(c.id) ?? 0) < GAP_MS) continue;
      const m = memberN.get(c.id) ?? 0;
      const present = sunday.get(c.id) ?? 0;
      const facts: ChurchFacts = {
        ageDays: Math.floor((now.getTime() - c.createdAt.getTime()) / DAY),
        plan: paidPlan(c.subscription),
        members: m,
        attendanceEver: att.get(c.id)?.n ?? 0,
        lastSunday: present > 0 ? { present, absent: Math.max(0, m - present), date: sun.label } : null,
        activeRecently: active.has(c.id),
        weekday,
      };
      const done = sentSteps.get(c.id) ?? new Set<string>();
      const step = CHURCH_STEP_ORDER.find((id) => s.steps[id] !== false && !done.has(id) && stepApplies(id, facts, live));
      if (step) list.push({ kind: "church", email: o.email, name: o.name, churchId: c.id, church: c.name, slug: c.slug, step, facts });
    }
  }
  return { list, live };
}

/** Sends what is due, within the limits. Safe to run more than once: each address gets each email once. */
/**
 * `budgetMs` counts from the moment this starts (working out who is due included), so a caller with a hard time
 * limit (the host stops a request after about 10 seconds) can give it a budget that always fits.
 * `perRun` defaults to whatever is left of today's cap: the time budget is what keeps one run short.
 */
export async function runEmailSequence(now = new Date(), opts: { force?: boolean; budgetMs?: number; perRun?: number } = {}) {
  const deadline = Date.now() + (opts.budgetMs ?? 20_000);
  const s = await getSequenceSettings();
  if (!s.enabled && !opts.force) return { skipped: "off" };
  const hour = now.getUTCHours();
  if (!opts.force && (hour < 7 || hour > 10)) return { skipped: "outside 07:00-10:59" };

  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sentToday = await db.lifecycleSend.count({ where: { sentAt: { gte: startOfDay } } });
  let room = Math.min(s.dailyCap - sentToday, opts.perRun ?? Infinity);
  if (room <= 0) return { skipped: "daily cap reached", sentToday };

  // Kept for 3 minutes, so back-to-back runs (the SuperAdmin button sends in short batches) do not work it out again.
  // Anyone already sent is skipped by the claim below, so a slightly old list can never send twice.
  const { list, live } = await ttlCached(`sequence-due-run:${startOfDay.toISOString()}`, 3 * 60_000, () => dueEmails(now, s));
  let sent = 0, failed = 0, timedOut = false;
  for (const c of list) {
    if (room <= 0) break;
    if (Date.now() > deadline) { timedOut = true; break; }
    if ((await emailRoomToday()).total <= KEEP_FOR_ESSENTIALS) return { stopped: "email senders near today's limit (room kept for sign-in codes and receipts)", sent, failed, due: list.length };
    const step: StepId = c.kind === "signup" ? "finish-signup" : c.step;

    // Claim first: the unique (email, step) row means a second run can never send it again.
    const claim = await db.lifecycleSend.create({
      data: { churchId: c.kind === "church" ? c.churchId : null, email: c.email, step, status: "sending" },
    }).catch(() => null);
    if (!claim) continue;

    const data = c.kind === "signup"
      ? mergeData(live, { name: c.name, church: c.church, resume: resumeToken(c.vid) })
      : mergeData(live, { name: c.name, church: c.church, slug: c.slug, facts: c.facts });
    const mail = buildEmail(step, data, unsubscribeUrl(c.email), c.kind === "signup");
    const r = await sendEmail({ to: c.email, subject: mail.subject, html: mail.html, replyTo: outreachContact() }).catch((e) => ({ ok: false, stubbed: false, error: (e as Error).message }));
    const status = r.stubbed ? "stubbed" : r.ok ? "sent" : "failed";
    // A failed send gives the claim back, so the next run tries again. A sent or test (stubbed) one stays claimed.
    if (status === "failed") await db.lifecycleSend.delete({ where: { id: claim.id } }).catch(() => {});
    else await db.lifecycleSend.update({ where: { id: claim.id }, data: { status } }).catch(() => {});
    if (c.kind === "church") {
      // Also in the church's outreach history, so SuperAdmin sees every message a church has had in one place.
      await db.outreachMessage.create({
        data: { churchId: c.churchId, toName: c.name, to: c.email, channel: "email", template: `seq-${step}`, subject: mail.subject, body: mail.body, status, error: r.ok ? null : (r as { error?: string }).error ?? null, auto: true },
      }).catch(() => {});
    }
    if (r.ok) { sent++; room--; } else failed++;
  }
  // more = stopped only because time ran out: another run can carry on.
  return { sent, failed, due: list.length, more: timedOut && room > 0 };
}
