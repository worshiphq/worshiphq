import "server-only";
import { env, features } from "@/lib/env";
import nodemailer from "nodemailer";

export type EmailResult = {
  ok: boolean;
  provider: string;
  stubbed: boolean;
  error?: string;
};

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  /**
   * Record this send in the church's communications history (shows up
   * alongside broadcasts on the Communications page). Omit entirely for
   * anything that shouldn't leave a readable trail - a verification code,
   * for instance - rather than passing a redacted body; callers that do pass
   * `log` are asserting the body is already safe to store as-is.
   */
  log?: { churchId: string; name: string; segment?: string };
}): Promise<EmailResult> {
  const provider = env.EMAIL_PROVIDER;
  const from = opts.from ?? env.EMAIL_FROM;
  const to = Array.isArray(opts.to) ? opts.to : [opts.to];

  let result: EmailResult;

  if (!features.email) {
    console.info(
      `[Email:stub] (${provider}) ${from} → ${to.join(", ")} · "${opts.subject}"`
    );
    result = { ok: true, provider, stubbed: true };
  } else {
    try {
      if (provider === "resend") {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.RESEND_API_KEY}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from,
            to,
            subject: opts.subject,
            html: opts.html,
          }),
        });
        result = { ok: res.ok, provider, stubbed: false };
      } else if (provider === "smtp") {
        const transporter = nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: false,
          auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASSWORD,
          },
        });
        await transporter.sendMail({
          from,
          to: to.join(","),
          subject: opts.subject,
          html: opts.html,
        });
        result = { ok: true, provider, stubbed: false };
      } else {
        console.warn(
          `[Email] provider "${provider}" not yet implemented - logging instead`
        );
        result = { ok: true, provider, stubbed: true };
      }
    } catch (e) {
      result = { ok: false, provider, stubbed: false, error: (e as Error).message };
    }
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