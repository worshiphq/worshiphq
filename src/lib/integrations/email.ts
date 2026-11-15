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

async function sendVia(p: Provider, m: Mail): Promise<void> {
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
    return;
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
    if (!res.ok) throw new Error(`Resend refused it (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return;
  }

  // SMTP (Brevo relay or any server) and Gmail both go through nodemailer.
  const gmail = p === "gmail";
  const transporter = nodemailer.createTransport(
    gmail
      ? { host: "smtp.gmail.com", port: 465, secure: true, auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD } }
      : { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: false, auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } },
  );
  // Gmail only sends as its own address: keep the WorshipHQ name, and make sure replies reach the usual address.
  const from = gmail ? `${parseFrom(m.from).name ?? "WorshipHQ"} <${env.GMAIL_USER}>` : m.from;
  await transporter.sendMail({
    from,
    to: m.to.join(","),
    subject: m.subject,
    html: m.html,
    replyTo: m.replyTo ?? (gmail ? parseFrom(m.from).email : undefined),
    attachments: m.attachments,
  });
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
}): Promise<EmailResult> {
  const from = opts.from ?? env.EMAIL_FROM;
  const to = Array.isArray(opts.to) ? opts.to : [opts.to];
  const chain = emailChain();

  let result: EmailResult;
  if (!features.email || chain.length === 0) {
    console.info(`[Email:stub] ${from} → ${to.join(", ")} · "${opts.subject}"`);
    result = { ok: true, provider: "stub", stubbed: true };
  } else {
    const attempts: NonNullable<EmailResult["attempts"]> = [];
    result = { ok: false, provider: chain[chain.length - 1]!, stubbed: false };
    for (const p of chain) {
      try {
        await sendVia(p, { to, subject: opts.subject, html: opts.html, from, replyTo: opts.replyTo, attachments: opts.attachments });
        attempts.push({ provider: p, ok: true });
        result = { ok: true, provider: p, stubbed: false, attempts };
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

  if (opts.log) await logSend(opts.log, to, opts.subject, opts.html, result.ok);
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
