import "server-only";
import { env, features } from "@/lib/env";
import nodemailer from "nodemailer";

export type EmailResult = {
  ok: boolean;
  /** The sender that actually delivered it (or the last one tried, when all failed). */
  provider: string;
  stubbed: boolean;
  error?: string;
  /** Every sender tried, in order, and why the ones before the winner were skipped or refused. */
  attempts?: { provider: string; ok: boolean; error?: string }[];
  messageId?: string;
};

type Mail = {
  to: string[];
  subject: string;
  html: string;
  from: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer }[];
};

/**
 * Email goes out through a CHAIN of senders. Each email tries the first one; if it is full, down, or refuses the
 * email, the next one is tried straight away, so one provider's daily limit never stops email:
 *
 *   brevo   Brevo's API (BREVO_API_KEY). Before sending we ask Brevo how many emails the plan has left today, and
 *           skip it when it has none, instead of waiting for it to refuse or quietly hold the email back.
 *   smtp    any SMTP server (SMTP_HOST/USER/PASSWORD). In production this is Brevo's SMTP relay, used when there is
 *           no Brevo API key.
 *   resend  Resend's API (RESEND_API_KEY). Sends as our own domain once worshiphq.app is verified in Resend.
 *   gmail   a Gmail account with an App Password (GMAIL_USER/GMAIL_APP_PASSWORD). The last resort: it sends as the
 *           Gmail address, with replies still going to the usual reply-to.
 *
 * Senders that are not set up are left out. EMAIL_CHAIN can change the order. Nothing set up = emails are logged,
 * not sent (local development).
 */
const ALL = ["brevo", "smtp", "resend", "gmail"] as const;
type Provider = (typeof ALL)[number];

function configured(p: Provider): boolean {
  if (p === "brevo") return !!env.BREVO_API_KEY;
  if (p === "smtp") return !!(env.SMTP_HOST && env.SMTP_USER);
  if (p === "resend") return !!env.RESEND_API_KEY;
  return !!(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);
}

export function emailChain(): Provider[] {
  const wanted = (env.EMAIL_CHAIN ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s): s is Provider => (ALL as readonly string[]).includes(s));
  const order = wanted.length ? wanted : [...ALL];
  // With a Brevo API key, Brevo's SMTP relay would be the same account and the same limit: no point trying it twice.
  return order.filter((p) => configured(p) && !(p === "smtp" && configured("brevo") && /brevo|sendinblue/i.test(env.SMTP_HOST ?? "")));
}

/** "Name <a@b.c>" or "a@b.c" into its parts. */
function parseFrom(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1]?.trim() || undefined, email: m[2]!.trim() } : { email: from.trim() };
}

/* ── Brevo's daily limit, counted by us ──
   Over SMTP, Brevo says "accepted" even after the plan's daily limit, then holds the email back without a word
   (15 Nov 2026: 313 sent by 18:11, then receipts accepted and never delivered). So we count what went through
   Brevo today (UTC day, as Brevo's limit resets) from the email log, and skip Brevo once the limit is reached. */
const isBrevo = (p: Provider) => p === "brevo" || (p === "smtp" && /brevo|sendinblue/i.test(env.SMTP_HOST ?? ""));
let brevoCount: { day: string; at: number; sent: number } | null = null;
export async function brevoSentToday(): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  if (brevoCount && brevoCount.day === day && Date.now() - brevoCount.at < 60_000) return brevoCount.sent;
  let sent = brevoCount?.day === day ? brevoCount.sent : 0;
  try {
    const { db } = await import("@/lib/db");
    const rows = await db.$queryRaw<{ n: bigint | null }[]>`
      SELECT COALESCE(SUM(array_length(string_to_array("toAddrs", ','), 1)), 0) AS n
      FROM "EmailLog"
      WHERE status = 'sent' AND provider IN ('brevo', 'smtp') AND COALESCE("resentAt", "createdAt") >= ${new Date(`${day}T00:00:00Z`)}`;
    sent = Number(rows[0]?.n ?? 0);
  } catch {
    /* no log table: rely on Brevo refusing */
  }
  brevoCount = { day, at: Date.now(), sent };
  return sent;
}

/* ── Resend's daily limit, counted the same way ── */
let resendCount: { day: string; at: number; sent: number } | null = null;
let resendFullDay: string | null = null; // Resend said "daily quota exceeded" today
export async function resendSentToday(): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  if (resendCount && resendCount.day === day && Date.now() - resendCount.at < 60_000) return resendCount.sent;
  let sent = resendCount?.day === day ? resendCount.sent : 0;
  try {
    const { db } = await import("@/lib/db");
    const rows = await db.$queryRaw<{ n: bigint | null }[]>`
      SELECT COALESCE(SUM(array_length(string_to_array("toAddrs", ','), 1)), 0) AS n
      FROM "EmailLog"
      WHERE status = 'sent' AND provider = 'resend' AND COALESCE("resentAt", "createdAt") >= ${new Date(`${day}T00:00:00Z`)}`;
    sent = Number(rows[0]?.n ?? 0);
  } catch {
    /* no log table: rely on Resend refusing */
  }
  resendCount = { day, at: Date.now(), sent };
  return sent;
}

/**
 * How many more emails can go out today across EVERY sender in the chain (Brevo + Resend), so bulk sends such as
 * the email sequence use the backup too instead of stopping when Brevo alone is busy. Senders with no known daily
 * limit (a plain SMTP server, Gmail) are not counted.
 */
export async function emailRoomToday(): Promise<{ total: number; brevo: number | null; resend: number | null }> {
  const chain = emailChain();
  const day = new Date().toISOString().slice(0, 10);
  const brevo = chain.some(isBrevo) ? Math.max(0, env.BREVO_DAILY_LIMIT - (await brevoSentToday())) : null;
  const resend = chain.includes("resend") ? (resendFullDay === day ? 0 : Math.max(0, env.RESEND_DAILY_LIMIT - (await resendSentToday()))) : null;
  return { total: (brevo ?? 0) + (resend ?? 0), brevo, resend };
}

/* ── Brevo: how many emails are left today, checked at most every 2 minutes ── */
let brevoQuota: { at: number; left: number | null } | null = null;
export async function brevoEmailsLeft(): Promise<number | null> {
  if (brevoQuota && Date.now() - brevoQuota.at < 120_000) return brevoQuota.left;
  let left: number | null = null;
  try {
    const res = await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": env.BREVO_API_KEY!, accept: "application/json" } });
    if (res.ok) {
      const acc = (await res.json()) as { plan?: { type?: string; credits?: number; creditsType?: string }[] };
      // The plan entry whose credits are email sends (free plans: a daily "sendLimit"; paid: monthly email credits).
      const email = acc.plan?.find((p) => p.creditsType === "sendLimit" || p.type === "free" || p.type === "payAsYouGo" || p.type === "subscription");
      left = typeof email?.credits === "number" ? email.credits : null;
    }
  } catch {
    /* if we cannot tell, just try to send */
  }
  brevoQuota = { at: Date.now(), left };
  return left;
}

/** Sends through one provider. Returns the message id the provider gave it, when it gives one. */
async function sendVia(p: Provider, m: Mail): Promise<string | undefined> {
  if (isBrevo(p)) {
    const used = await brevoSentToday();
    if (used + m.to.length > env.BREVO_DAILY_LIMIT) throw new Error(`Brevo's ${env.BREVO_DAILY_LIMIT} emails for today are used up (${used} sent)`);
  }
  if (p === "resend") {
    if (resendFullDay === new Date().toISOString().slice(0, 10)) throw new Error("Resend's emails for today are used up");
    const used = await resendSentToday();
    if (used + m.to.length > env.RESEND_DAILY_LIMIT) throw new Error(`Resend's ${env.RESEND_DAILY_LIMIT} emails for today are used up (${used} sent)`);
  }
  const id = await sendOne(p, m);
  if (isBrevo(p) && brevoCount) brevoCount.sent += m.to.length;
  if (p === "resend" && resendCount) resendCount.sent += m.to.length;
  return id;
}

async function sendOne(p: Provider, m: Mail): Promise<string | undefined> {
  if (p === "brevo") {
    const left = await brevoEmailsLeft();
    if (left !== null && left < m.to.length) throw new Error(`Brevo has ${left} emails left today`);
    const sender = parseFrom(m.from);
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: sender.email, ...(sender.name ? { name: sender.name } : {}) },
        to: m.to.map((email) => ({ email })),
        subject: m.subject,
        htmlContent: m.html,
        ...(m.replyTo ? { replyTo: { email: parseFrom(m.replyTo).email } } : {}),
        ...(m.attachments?.length ? { attachment: m.attachments.map((a) => ({ name: a.filename, content: a.content.toString("base64") })) } : {}),
      }),
    });
    if (!res.ok) {
      // A refusal for being out of credits means the rest of today will be refused too: remember it.
      if (res.status === 402 || res.status === 429) brevoQuota = { at: Date.now(), left: 0 };
      throw new Error(`Brevo refused it (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    if (brevoQuota?.left != null) brevoQuota.left = Math.max(0, brevoQuota.left - m.to.length);
    const out = (await res.json().catch(() => ({}))) as { messageId?: string };
    return out.messageId;
  }

  if (p === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: m.from,
        to: m.to,
        subject: m.subject,
        html: m.html,
        ...(m.replyTo ? { reply_to: m.replyTo } : {}),
        ...(m.attachments?.length ? { attachments: m.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) } : {}),
      }),
    });
    if (!res.ok) {
      // Over the daily or monthly quota: every other email today would be refused too, so stop trying Resend.
      if (res.status === 429) resendFullDay = new Date().toISOString().slice(0, 10);
      throw new Error(`Resend refused it (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    const out = (await res.json().catch(() => ({}))) as { id?: string };
    return out.id ? `resend:${out.id}` : undefined;
  }

  // SMTP (Brevo relay or any server) and Gmail both go through nodemailer.
  const gmail = p === "gmail";
  const transporter = nodemailer.createTransport(
    gmail
      ? { host: "smtp.gmail.com", port: 465, secure: true, auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "") } }
      : { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: false, auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } },
  );
  // Gmail only sends as its own address: keep the WorshipHQ name, and make sure replies reach the usual address.
  const from = gmail ? `${parseFrom(m.from).name ?? "WorshipHQ"} <${env.GMAIL_USER}>` : m.from;
  const info = await transporter.sendMail({
    from,
    to: m.to.join(","),
    subject: m.subject,
    html: m.html,
    replyTo: m.replyTo ?? (gmail ? parseFrom(m.from).email : undefined),
    attachments: m.attachments,
  });
  return info.messageId;
}

/** Reserved test domains (RFC 2606/6761): mail to them can never be delivered, so it is never handed to a provider. */
export function isReservedEmail(address: string): boolean {
  const domain = address.trim().toLowerCase().replace(/>$/, "").split("@").pop() ?? "";
  return /(^|\.)(test|example|invalid|localhost)$/.test(domain) || /(^|\.)example\.(com|net|org)$/.test(domain);
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  /** Where replies go (the default sender is a no-reply address). */
  replyTo?: string;
  /**
   * Record this send in the church's communications history (shows up
   * alongside broadcasts on the Communications page). Omit entirely for
   * anything that shouldn't leave a readable trail - a verification code,
   * for instance - rather than passing a redacted body; callers that do pass
   * `log` are asserting the body is already safe to store as-is.
   */
  log?: { churchId: string; name: string; segment?: string };
  attachments?: { filename: string; content: Buffer }[];
  /**
   * Sign-in codes, password links and the like: recorded in the email log without the body, and never sent
   * again from there (an old code or link is useless, and should not sit in the database).
   */
  private?: boolean;
  /** Which church the email is about, for the email log, when it is not written to the church's history. */
  churchId?: string;
  /** Internal: sending an EmailLog row again updates that row instead of writing a new one. */
  logId?: string;
  /** Start the chain at this sender, skipping the ones before it (SuperAdmin's "Send through Resend"). */
  startAt?: string;
}): Promise<EmailResult> {
  const from = opts.from ?? env.EMAIL_FROM;
  const to = Array.isArray(opts.to) ? opts.to : [opts.to];
  const full = emailChain();
  const start = opts.startAt ? full.indexOf(opts.startAt as Provider) : -1;
  const chain = start >= 0 ? full.slice(start) : full;

  // Test addresses (the internal QA church's owner, fixtures) are dropped before any provider sees them.
  const deliverable = to.filter((a) => !isReservedEmail(a));
  let result: EmailResult;
  if (deliverable.length === 0) {
    console.info(`[Email:stub] reserved test address(es) ${to.join(", ")} · "${opts.subject}"`);
    result = { ok: true, provider: "stub", stubbed: true };
  } else if (!features.email || chain.length === 0) {
    console.info(`[Email:stub] ${from} → ${to.join(", ")} · "${opts.subject}"`);
    result = { ok: true, provider: "stub", stubbed: true };
  } else {
    const attempts: NonNullable<EmailResult["attempts"]> = [];
    result = { ok: false, provider: chain[chain.length - 1]!, stubbed: false };
    for (const p of chain) {
      try {
        const messageId = await sendVia(p, { to: deliverable, subject: opts.subject, html: opts.html, from, replyTo: opts.replyTo, attachments: opts.attachments });
        attempts.push({ provider: p, ok: true });
        result = { ok: true, provider: p, stubbed: false, attempts, messageId };
        break;
      } catch (e) {
        const error = (e as Error).message;
        attempts.push({ provider: p, ok: false, error });
        console.warn(`[Email] ${p} could not send "${opts.subject}" to ${to.length} recipient(s): ${error}. Trying the next sender.`);
        result = { ok: false, provider: p, stubbed: false, error, attempts };
      }
    }
    if (result.ok && attempts.length > 1) console.info(`[Email] sent via ${result.provider} after ${attempts.length - 1} fallback(s)`);
    if (!result.ok) console.error(`[Email] every sender failed for "${opts.subject}": ${attempts.map((a) => `${a.provider}: ${a.error}`).join(" | ")}`);
  }

  // A resend from the email log already has its line in the church's history.
  if (opts.log && !opts.logId) await logSend(opts.log, to, opts.subject, opts.html, result.ok);
  await recordEmail(opts, from, to, result);
  return result;
}

/** Record a sent email in the church's communications history - same
 *  Communication/CommunicationRecipient tables the broadcast composer uses,
 *  so transactional sends (invites, receipts, assigned follow-ups, admin
 *  alerts) show up in the same place instead of leaving no trace at all. */
async function logSend(
  log: { churchId: string; name: string; segment?: string },
  to: string[],
  subject: string,
  html: string,
  ok: boolean,
) {
  try {
    const { db } = await import("@/lib/db");
    const comm = await db.communication.create({
      data: {
        churchId: log.churchId,
        name: log.name,
        channel: "Email",
        body: `${subject}\n\n${html}`,
        segment: log.segment ?? null,
        sent: ok ? to.length : 0,
        delivered: ok ? to.length : 0,
        status: "sent",
      },
    });
    await db.communicationRecipient.createMany({
      data: to.map((contact) => ({ communicationId: comm.id, contact, status: ok ? "sent" : "failed" })),
    });
  } catch {
    /* logging must never block the actual send */
  }
}

/* ── The email log (SuperAdmin, Emails): every send, so failures can be seen and sent again ── */

/** Attachments bigger than this are not kept (a church backup, say): such an email can't be sent again from the log. */
const KEEP_ATTACHMENTS_BYTES = 3 * 1024 * 1024;

async function recordEmail(
  opts: { subject: string; html: string; replyTo?: string; log?: { churchId: string }; churchId?: string; attachments?: { filename: string; content: Buffer }[]; private?: boolean; logId?: string },
  from: string,
  to: string[],
  r: EmailResult,
) {
  try {
    const { db } = await import("@/lib/db");
    const status = r.stubbed ? "stubbed" : r.ok ? "sent" : "failed";
    const common = { status, provider: r.provider, error: r.ok ? null : r.error ?? null, attempts: (r.attempts ?? []) as object, messageId: r.messageId ?? null };
    if (opts.logId) {
      await db.emailLog.update({
        where: { id: opts.logId },
        data: { ...common, toAddrs: to.join(","), tries: { increment: 1 }, resentAt: new Date(), delivery: null, deliveryNote: null, deliveryCheckedAt: null },
      });
      return;
    }
    const size = (opts.attachments ?? []).reduce((n, a) => n + a.content.length, 0);
    const keepFiles = !opts.private && size > 0 && size <= KEEP_ATTACHMENTS_BYTES;
    await db.emailLog.create({
      data: {
        ...common,
        churchId: opts.log?.churchId ?? opts.churchId ?? null,
        toAddrs: to.join(","),
        // A sign-in code is in the subject itself: keep only the words around it.
        subject: opts.private ? opts.subject.replace(/\d{4,}/g, "••••••") : opts.subject,
        fromAddr: from,
        replyTo: opts.replyTo ?? null,
        html: opts.private ? null : opts.html,
        attachments: keepFiles ? opts.attachments!.map((a) => ({ filename: a.filename, b64: a.content.toString("base64") })) : undefined,
        retryable: !opts.private && (size === 0 || keepFiles),
      },
    });
  } catch {
    /* the log must never block an email (and the table may not exist until sql/email-log.sql is run) */
  }
}

/** Send one logged email again, through the whole chain, optionally to a corrected address. */
export async function resendLoggedEmail(id: string, toOverride?: string, startAt?: string): Promise<EmailResult> {
  const { db } = await import("@/lib/db");
  const row = await db.emailLog.findUnique({ where: { id } });
  if (!row) return { ok: false, provider: "none", stubbed: false, error: "That email is not in the log." };
  if (row.html == null || (!row.retryable && !toOverride)) {
    return { ok: false, provider: "none", stubbed: false, error: row.html == null ? "This email can't be sent again (a sign-in code, a password link, or too big to keep)." : "This address bounced or is blocked. Send it to a corrected address instead." };
  }
  const files = Array.isArray(row.attachments) ? (row.attachments as { filename: string; b64: string }[]) : [];
  if (toOverride) await db.emailLog.update({ where: { id }, data: { retryable: true } });
  return sendEmail({
    to: toOverride ? toOverride.split(",").map((s) => s.trim()).filter(Boolean) : row.toAddrs.split(","),
    subject: row.subject,
    html: row.html,
    from: row.fromAddr,
    replyTo: row.replyTo ?? undefined,
    attachments: files.map((f) => ({ filename: f.filename, content: Buffer.from(f.b64, "base64") })),
    logId: row.id,
    startAt,
  });
}

/**
 * Send again every failed email from the last few days that can be sent again, oldest first, until the time
 * budget runs out. Used by the hourly job and by "Send all failed" in SuperAdmin.
 */
export async function retryFailedEmails(opts: { maxTries?: number; days?: number; budgetMs?: number; limit?: number } = {}) {
  const { db } = await import("@/lib/db");
  const started = Date.now();
  const rows = await db.emailLog.findMany({
    where: {
      status: "failed",
      retryable: true,
      tries: { lt: opts.maxTries ?? 4 },
      createdAt: { gte: new Date(Date.now() - (opts.days ?? 3) * 86_400_000) },
    },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 100,
    select: { id: true },
  });
  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    if (Date.now() - started > (opts.budgetMs ?? 40_000)) break;
    const res = await resendLoggedEmail(r.id).catch(() => null);
    if (res?.ok) sent++;
    else failed++;
    // Every sender keeps failing: they are all full or down, so stop instead of failing the rest one by one.
    if (failed >= 3 && sent === 0) break;
  }
  return { waiting: rows.length, sent, failed };
}

/* ── Brevo delivery check: what happened after Brevo accepted an email ── */

type BrevoEvent = { event?: string; reason?: string };
const BAD = ["hardBounces", "bounces", "invalid", "blocked", "error", "spam"];

/** Ask Brevo what happened to each email (by its message id). Needs BREVO_API_KEY. */
export async function checkBrevoDelivery(ids: string[]): Promise<{ checked: number; error?: string }> {
  if (!env.BREVO_API_KEY) return { checked: 0, error: "Add BREVO_API_KEY first: delivery checks ask Brevo's API." };
  const { db } = await import("@/lib/db");
  const rows = await db.emailLog.findMany({ where: { id: { in: ids }, messageId: { not: null }, status: "sent", provider: { in: ["brevo", "smtp"] } }, select: { id: true, messageId: true } });
  let checked = 0;
  for (const r of rows) {
    try {
      const url = `https://api.brevo.com/v3/smtp/statistics/events?limit=50&days=30&messageId=${encodeURIComponent(r.messageId!)}`;
      const res = await fetch(url, { headers: { "api-key": env.BREVO_API_KEY, accept: "application/json" } });
      if (!res.ok) continue;
      const events = ((await res.json()) as { events?: BrevoEvent[] }).events ?? [];
      const has = (names: string[]) => events.find((e) => e.event && names.includes(e.event));
      const bad = has(BAD);
      const soft = has(["softBounces", "deferred"]);
      const delivery = bad ? (bad.event === "blocked" ? "blocked" : bad.event === "spam" ? "spam" : "bounced")
        : has(["opened", "clicks", "uniqueOpened", "loadedByProxy"]) ? "opened"
        : has(["delivered"]) ? "delivered"
        : soft ? "deferred"
        : events.length ? "waiting" : "unknown";
      await db.emailLog.update({
        where: { id: r.id },
        // A bounced or blocked address will fail the same way again: only a corrected address helps.
        data: { delivery, deliveryNote: (bad ?? soft)?.reason ?? null, deliveryCheckedAt: new Date(), ...(bad ? { retryable: false } : {}) },
      });
      checked++;
    } catch {
      /* try the next one */
    }
  }
  return { checked };
}
