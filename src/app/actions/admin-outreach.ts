"use server";

import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { env, features } from "@/lib/env";
import { outreachContact, outreachContactLine, sendOutreach, type OutreachResult } from "@/lib/outreach/send";
import { templateById } from "@/lib/outreach/templates";
import { getAlertPhone } from "@/lib/outreach/owner-alert";
import { sendSms } from "@/lib/integrations/sms";

export type OutreachContact = { userId: string; name: string; email: string; phone: string | null; role: string };
export type OutreachChurch = {
  id: string; name: string; plan: string; suspended: boolean; createdAt: string; country: string | null; city: string | null;
  contacts: OutreachContact[];
  welcomedAt: string | null; lastContactAt: string | null; messages: number;
};
export type OutreachData = { churches: OutreachChurch[]; emailLive: boolean; smsLive: boolean; contact: string; contactLine: string; smsProvider: string; alert: { phone: string; from: "saved" | "company" | "none"; saved: string } };
export type OutreachHistoryRow = { id: string; channel: string; template: string; to: string; toName: string | null; subject: string | null; body: string; status: string; error: string | null; auto: boolean; at: string };

/** Every real church with its owner and admins, and what we have already sent them. */
export async function getOutreachData(): Promise<OutreachData> {
  await requireSuperAdmin();
  const [churches, welcomes, last] = await Promise.all([
    db.church.findMany({
      where: { isDemo: false },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, suspended: true, createdAt: true, country: true, city: true,
        subscription: { select: { plan: true } },
        users: { where: { role: { in: ["Owner", "Admin"] } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, phone: true, role: true } },
      },
    }),
    db.outreachMessage.groupBy({ by: ["churchId"], where: { channel: "email", template: "welcome", status: "sent" }, _min: { createdAt: true } }),
    db.outreachMessage.groupBy({ by: ["churchId"], _max: { createdAt: true }, _count: { _all: true } }),
  ]);
  const alert = await getAlertPhone();
  const savedAlert = (await db.platformConfig.findUnique({ where: { id: "default" }, select: { alertPhone: true } }))?.alertPhone ?? "";
  const w = new Map(welcomes.map((x) => [x.churchId, x._min.createdAt]));
  const l = new Map(last.map((x) => [x.churchId, { at: x._max.createdAt, n: x._count._all }]));
  return {
    emailLive: features.email, smsLive: features.sms, contact: outreachContact(), contactLine: await outreachContactLine(), smsProvider: env.SMS_PROVIDER, alert: { ...alert, saved: savedAlert },
    churches: churches.map((c) => ({
      id: c.id, name: c.name, plan: c.subscription?.plan ?? "free", suspended: c.suspended, createdAt: c.createdAt.toISOString(), country: c.country, city: c.city,
      // The owner first, then admins.
      contacts: [...c.users].sort((a, b) => (a.role === "Owner" ? 0 : 1) - (b.role === "Owner" ? 0 : 1)).map((u) => ({ userId: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role })),
      welcomedAt: w.get(c.id)?.toISOString() ?? null,
      lastContactAt: l.get(c.id)?.at?.toISOString() ?? null,
      messages: l.get(c.id)?.n ?? 0,
    })),
  };
}

/** One email to one contact (the template, or your own edited wording). */
export async function sendChurchEmail(input: { churchId: string; userId: string; template: string; subject: string; body: string }): Promise<OutreachResult> {
  await requireSuperAdmin();
  const t = templateById(input.template);
  return sendOutreach({ churchId: input.churchId, userId: input.userId, channel: "email", template: t?.channel === "email" ? t.id : "custom-email", subject: input.subject, body: input.body });
}

/** One text message to one contact. */
export async function sendChurchSms(input: { churchId: string; userId: string; template: string; body: string }): Promise<OutreachResult> {
  await requireSuperAdmin();
  const t = templateById(input.template);
  return sendOutreach({ churchId: input.churchId, userId: input.userId, channel: "sms", template: t?.channel === "sms" ? t.id : "custom-sms", body: input.body });
}

export async function getOutreachHistory(churchId: string): Promise<OutreachHistoryRow[]> {
  await requireSuperAdmin();
  const rows = await db.outreachMessage.findMany({ where: { churchId }, orderBy: { createdAt: "desc" }, take: 50 });
  return rows.map((r) => ({ id: r.id, channel: r.channel, template: r.template, to: r.to, toName: r.toName, subject: r.subject, body: r.body, status: r.status, error: r.error, auto: r.auto, at: r.createdAt.toISOString() }));
}

/** The number that gets a text whenever a church signs up. Empty = use the phone from the receipt company details. */
export async function saveAlertPhone(phone: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const raw = phone.trim();
  if (raw) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) return { ok: false, error: "That phone number does not look right." };
  }
  await db.platformConfig.upsert({ where: { id: "default" }, update: { alertPhone: raw || null }, create: { id: "default", alertPhone: raw || null } });
  return { ok: true };
}

export type TestSmsResult =
  | { ok: true; stubbed: boolean; provider: string; dialled: string; ghana: boolean; id: string | null }
  | { ok: false; error: string; provider?: string; dialled?: string; ghana?: boolean };

/**
 * Send one test text to any number, to see whether the SMS provider delivers there (for example outside Ghana).
 * The number must include its country code, because a number starting with 0 is always read as Ghanaian.
 */
export async function sendTestSms(input: { to: string; message: string }): Promise<TestSmsResult> {
  await requireSuperAdmin();
  const raw = String(input.to ?? "").trim();
  const message = String(input.message ?? "").trim().slice(0, 160);
  if (!message) return { ok: false, error: "Type a short message." };
  const digits = raw.replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00/, "");
  if (raw.replace(/[\s\-()]/g, "").startsWith("0") && !raw.startsWith("00")) return { ok: false, error: "Start with the country code, like +234 or +44. A number starting with 0 is read as Ghana." };
  if (digits.length < 8 || digits.length > 15) return { ok: false, error: "That phone number does not look right." };
  const ghana = digits.startsWith("233");
  const r = await sendSms(digits, message, { heading: null });
  if (!r.ok) return { ok: false, error: r.error ?? "The SMS provider refused it.", provider: r.provider, dialled: digits, ghana };
  return { ok: true, stubbed: r.stubbed, provider: r.provider, dialled: digits, ghana, id: r.id ?? null };
}

/** A test text to the alert number, so you can see it works before the next church signs up. */
export async function sendAlertTest(): Promise<{ ok: true; stubbed: boolean; to: string } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const { phone } = await getAlertPhone();
  if (!phone) return { ok: false, error: "Add a phone number first." };
  const r = await sendSms(phone, "Test: this is the text you will get when a new church signs up.", { heading: null });
  return r.ok ? { ok: true, stubbed: r.stubbed, to: phone } : { ok: false, error: r.error ?? "The SMS provider refused it." };
}
