"use server";

import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { features } from "@/lib/env";
import { outreachContact, sendOutreach, type OutreachResult } from "@/lib/outreach/send";
import { templateById } from "@/lib/outreach/templates";

export type OutreachContact = { userId: string; name: string; email: string; phone: string | null; role: string };
export type OutreachChurch = {
  id: string; name: string; plan: string; suspended: boolean; createdAt: string; country: string | null; city: string | null;
  contacts: OutreachContact[];
  welcomedAt: string | null; lastContactAt: string | null; messages: number;
};
export type OutreachData = { churches: OutreachChurch[]; emailLive: boolean; smsLive: boolean; contact: string };
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
  const w = new Map(welcomes.map((x) => [x.churchId, x._min.createdAt]));
  const l = new Map(last.map((x) => [x.churchId, { at: x._max.createdAt, n: x._count._all }]));
  return {
    emailLive: features.email, smsLive: features.sms, contact: outreachContact(),
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
