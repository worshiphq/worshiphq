/**
 * Typed, validated environment loader for WorshipHQ.
 *
 * Philosophy: the app must run fully with ZERO real keys. Every integration is
 * optional — when its key is missing, the related feature drops into a safe
 * "demo/stub" mode (SMS/email/push log to console, payments use test mode, AI
 * returns canned responses). Only a tiny core is ever required.
 *
 * Required vars are validated at startup with clear errors. Optional vars are
 * coerced and exposed through `env`, plus a `features` map of booleans so the UI
 * can show which integrations are live.
 */
import { z } from "zod";

// Treat empty strings (common in shells/CI) as "absent" so optional integrations
// cleanly fall back to stub mode instead of failing validation.
const str = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().min(1).optional(),
);

const schema = z.object({
  // ── APP ──────────────────────────────────────────────
  NEXT_PUBLIC_APP_NAME: z.string().default("WorshipHQ"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // ── DATABASE ─────────────────────────────────────────
  DATABASE_URL: str, // optional in stub mode (seeded demo data is used instead)
  DIRECT_URL: str,

  // ── AUTH ─────────────────────────────────────────────
  NEXTAUTH_URL: str,
  NEXTAUTH_SECRET: str,
  GOOGLE_CLIENT_ID: str,
  GOOGLE_CLIENT_SECRET: str,

  // ── PAYMENTS (Paystack / GHS Mobile Money) ───────────
  PAYSTACK_SECRET_KEY: str,
  NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: str,
  PAYSTACK_WEBHOOK_SECRET: str,
  PAYSTACK_CALLBACK_URL: str,

  // ── SMS (Ghana providers) ────────────────────────────
  SMS_PROVIDER: z.enum(["arkesel", "hubtel", "mnotify", "twilio"]).default("arkesel"),
  ARKESEL_API_KEY: str,
  ARKESEL_SENDER_ID: z.string().default("WorshipHQ"),
  HUBTEL_CLIENT_ID: str,
  HUBTEL_CLIENT_SECRET: str,
  HUBTEL_SENDER_ID: z.string().default("WorshipHQs"),
  MNOTIFY_API_KEY: str,
  MNOTIFY_SENDER_ID: z.string().default("WorshipHQ"),
  TWILIO_ACCOUNT_SID: str,
  TWILIO_AUTH_TOKEN: str,
  TWILIO_PHONE_NUMBER: str,

  // ── EMAIL ────────────────────────────────────────────
  EMAIL_PROVIDER: z.enum(["resend", "sendgrid", "smtp"]).default("resend"),
  EMAIL_FROM: z.string().default("no-reply@worshiphq.org"),
  RESEND_API_KEY: str,
  SENDGRID_API_KEY: str,
  SMTP_HOST: str,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: str,
  SMTP_PASSWORD: str,

  // ── PUSH (Web Push / VAPID) ──────────────────────────
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: str,
  VAPID_PRIVATE_KEY: str,
  VAPID_SUBJECT: z.string().default("mailto:admin@worshiphq.org"),

  // ── STORAGE ──────────────────────────────────────────
  STORAGE_PROVIDER: z.enum(["cloudinary", "s3", "uploadthing"]).default("cloudinary"),
  CLOUDINARY_CLOUD_NAME: str,
  CLOUDINARY_API_KEY: str,
  CLOUDINARY_API_SECRET: str,

  // ── MAPS ─────────────────────────────────────────────
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: str,
  NEXT_PUBLIC_MAPBOX_TOKEN: str,

  // ── JOBS ─────────────────────────────────────────────
  CRON_SECRET: str,

  // ── AI ───────────────────────────────────────────────
  ANTHROPIC_API_KEY: str,
  OPENAI_API_KEY: str,

  // ── STOCK IMAGES ─────────────────────────────────────
  UNSPLASH_ACCESS_KEY: str,

  // ── SUPERADMIN (platform owner) ──────────────────────
  SUPERADMIN_EMAIL: z.string().default("worshiphqapp@gmail.com"),
  SUPERADMIN_PASSWORD: str, // plain; when unset, superadmin login is disabled in prod
});

function loadEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    // Only the tiny core is required; everything else is optional, so this should
    // rarely fire. When it does, fail loudly with an actionable message.
    throw new Error(
      `\n❌ Invalid environment variables:\n${issues}\n\nSee .env.example for the full list.\n`,
    );
  }
  return parsed.data;
}

export const env = loadEnv();

/** Which integrations are live (a real key is present) vs. running in stub mode. */
export const features = {
  database: !!env.DATABASE_URL,
  auth: !!env.NEXTAUTH_SECRET,
  googleAuth: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  payments: !!env.PAYSTACK_SECRET_KEY,
  sms:
    (env.SMS_PROVIDER === "arkesel" && !!env.ARKESEL_API_KEY) ||
    (env.SMS_PROVIDER === "hubtel" && !!(env.HUBTEL_CLIENT_ID && env.HUBTEL_CLIENT_SECRET)) ||
    (env.SMS_PROVIDER === "mnotify" && !!env.MNOTIFY_API_KEY) ||
    (env.SMS_PROVIDER === "twilio" && !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN)),
  email:
    (env.EMAIL_PROVIDER === "resend" && !!env.RESEND_API_KEY) ||
    (env.EMAIL_PROVIDER === "sendgrid" && !!env.SENDGRID_API_KEY) ||
    (env.EMAIL_PROVIDER === "smtp" && !!(env.SMTP_HOST && env.SMTP_USER)),
  push: !!(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
  storage:
    (env.STORAGE_PROVIDER === "cloudinary" && !!env.CLOUDINARY_CLOUD_NAME) ||
    (env.STORAGE_PROVIDER === "s3") ||
    (env.STORAGE_PROVIDER === "uploadthing"),
  maps: !!(env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || env.NEXT_PUBLIC_MAPBOX_TOKEN),
  ai: !!(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY),
} as const;

export type Features = typeof features;
