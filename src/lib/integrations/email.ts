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
}): Promise<EmailResult> {
  const provider = env.EMAIL_PROVIDER;
  const from = opts.from ?? env.EMAIL_FROM;
  const to = Array.isArray(opts.to) ? opts.to : [opts.to];

  if (!features.email) {
    console.info(
      `[Email:stub] (${provider}) ${from} → ${to.join(", ")} · "${opts.subject}"`
    );
    return { ok: true, provider, stubbed: true };
  }

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

      return { ok: res.ok, provider, stubbed: false };
    }

    if (provider === "smtp") {
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

      return { ok: true, provider, stubbed: false };
    }

    console.warn(
      `[Email] provider "${provider}" not yet implemented — logging instead`
    );

    return { ok: true, provider, stubbed: true };
  } catch (e) {
    return {
      ok: false,
      provider,
      stubbed: false,
      error: (e as Error).message,
    };
  }
}