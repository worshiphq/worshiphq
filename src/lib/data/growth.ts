import "server-only";
import { db } from "@/lib/db";
import { LIVE_CHURCH } from "@/lib/live-church";
import { ttlCached } from "@/lib/ttl-cache";

/**
 * In-app usage for SuperAdmin > Growth, from WorshipHQ's own database (never Google): sign-ups, where churches heard
 * of us, which churches are actually using it, and which features they use. Demo and internal QA churches are never
 * counted. Kept in memory for 30 minutes.
 */

const DAY = 86_400_000;

export type InAppUsage = {
  churches: number;
  signups: { today: number; d7: number; d30: number; prev30: number };
  daily: { date: string; signups: number }[];
  active: { d1: number; d7: number; d30: number };
  funnel: { signedUp: number; addedMembers: number; tookAttendance: number; paid: number };
  plans: { plan: string; churches: number }[];
  heardFrom: { source: string; d30: number; all: number }[];
  places: { place: string; churches: number }[];
  features: { label: string; d30: number; churches: number }[];
  recent: { name: string; city: string | null; country: string; heardFrom: string | null; createdAt: string; members: number }[];
};

const HEARD: Record<string, string> = {
  tiktok: "TikTok", facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", whatsapp: "WhatsApp",
  google: "Google search", friend: "Friend or another church", event: "Church event", other: "Other",
};

/** "ACCRA", "accra " and "Accra" are one town: merged, title-cased, biggest first. */
function mergePlaces(rows: { city: string | null; country: string; _count: number }[]) {
  const title = (v: string) => v.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const m = new Map<string, { place: string; churches: number }>();
  for (const r of rows) {
    const city = r.city?.trim() ? title(r.city) : "";
    const place = [city, r.country].filter(Boolean).join(", ") || "Unknown";
    const e = m.get(place.toLowerCase()) ?? { place, churches: 0 };
    e.churches += r._count;
    m.set(place.toLowerCase(), e);
  }
  return [...m.values()].sort((a, b) => b.churches - a.churches).slice(0, 12);
}

export function getInAppUsage(): Promise<InAppUsage> {
  return ttlCached("growth-in-app", 30 * 60_000, async () => {
    const now = Date.now();
    const d1 = new Date(now - DAY), d7 = new Date(now - 7 * DAY), d30 = new Date(now - 30 * DAY), d60 = new Date(now - 60 * DAY);
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);

    // Fewer, wider queries: active churches and sign-up counts are worked out from rows these already return.
    const [churches, last60, subs, heardAll, placesRaw, members30, att30, gifts30, sms30, auditEntities, recentChurches] = await Promise.all([
      db.church.count({ where: LIVE_CHURCH }),
      db.church.findMany({ where: { ...LIVE_CHURCH, createdAt: { gte: d60 } }, select: { id: true, createdAt: true, heardFrom: true } }),
      db.subscription.groupBy({ by: ["plan"], where: { church: LIVE_CHURCH, status: "active" }, _count: true }),
      db.church.groupBy({ by: ["heardFrom"], where: LIVE_CHURCH, _count: true }),
      db.church.groupBy({ by: ["city", "country"], where: LIVE_CHURCH, _count: true }),
      db.person.groupBy({ by: ["churchId"], where: { church: LIVE_CHURCH, joinedAt: { gte: d30 } }, _count: true }),
      db.attendanceRecord.groupBy({ by: ["churchId"], where: { church: LIVE_CHURCH, date: { gte: d30 } }, _count: true, _max: { date: true } }),
      db.gift.groupBy({ by: ["churchId"], where: { church: LIVE_CHURCH, date: { gte: d30 } }, _count: true, _max: { date: true } }),
      db.smsTransaction.groupBy({ by: ["churchId"], where: { church: LIVE_CHURCH, kind: "usage", createdAt: { gte: d30 } }, _sum: { credits: true }, _max: { createdAt: true } }),
      db.auditLog.groupBy({ by: ["entity", "churchId"], where: { church: LIVE_CHURCH, createdAt: { gte: d30 } }, _count: true, _max: { createdAt: true } }),
      db.church.findMany({
        where: LIVE_CHURCH, orderBy: { createdAt: "desc" }, take: 12,
        select: { name: true, city: true, country: true, heardFrom: true, createdAt: true, _count: { select: { people: true } } },
      }),
    ]);

    const recent30 = last60.filter((c) => c.createdAt >= d30);
    const todayN = last60.filter((c) => c.createdAt >= startOfToday).length;
    const n7 = last60.filter((c) => c.createdAt >= d7).length;
    const n30 = recent30.length;
    const prev30 = last60.length - n30;

    // A church is active on a day window if it logged an action, checked someone in, recorded a gift or sent a text.
    const lastActive = new Map<string, number>();
    const seen = (churchId: string, at: Date | null | undefined) => {
      if (!at) return;
      const t = at.getTime();
      if (t > (lastActive.get(churchId) ?? 0)) lastActive.set(churchId, t);
    };
    for (const r of att30) seen(r.churchId, r._max.date);
    for (const r of gifts30) seen(r.churchId, r._max.date);
    for (const r of sms30) seen(r.churchId, r._max.createdAt);
    for (const r of auditEntities) seen(r.churchId, r._max.createdAt);
    const activeSince = (d: Date) => [...lastActive.values()].filter((t) => t >= d.getTime()).length;
    const a1 = activeSince(d1), a7 = activeSince(d7), a30 = lastActive.size;

    // Sign-ups per day for the last 30 days.
    const byDay = new Map<string, number>();
    for (let i = 29; i >= 0; i--) byDay.set(new Date(now - i * DAY).toISOString().slice(0, 10), 0);
    for (const c of recent30) {
      const k = c.createdAt.toISOString().slice(0, 10);
      if (byDay.has(k)) byDay.set(k, (byDay.get(k) ?? 0) + 1);
    }

    // What last month's new churches went on to do.
    const newIds = recent30.map((c) => c.id);
    const [withMembers, withAttendance, paidNew] = newIds.length
      ? await Promise.all([
        db.person.groupBy({ by: ["churchId"], where: { churchId: { in: newIds } } }),
        db.attendanceRecord.groupBy({ by: ["churchId"], where: { churchId: { in: newIds } } }),
        db.subscription.count({ where: { churchId: { in: newIds }, status: "active", plan: { not: "free" } } }),
      ])
      : [[], [], 0];

    const heard30 = new Map<string, number>();
    for (const c of recent30) heard30.set(c.heardFrom ?? "", (heard30.get(c.heardFrom ?? "") ?? 0) + 1);
    const heardFrom = heardAll
      .map((h) => ({ source: h.heardFrom ? (HEARD[h.heardFrom] ?? h.heardFrom) : "Not answered", d30: heard30.get(h.heardFrom ?? "") ?? 0, all: h._count }))
      .sort((a, b) => b.all - a.all);

    // Feature use: real records for the big ones, the audit log for everything else.
    const sum = (rows: { _count: number }[]) => rows.reduce((s, r) => s + r._count, 0);
    const smsSent = sms30.reduce((s, r) => s + Math.abs(r._sum.credits ?? 0), 0);
    const auditByEntity = new Map<string, { n: number; churches: Set<string> }>();
    for (const r of auditEntities) {
      const e = auditByEntity.get(r.entity) ?? { n: 0, churches: new Set<string>() };
      e.n += r._count; e.churches.add(r.churchId);
      auditByEntity.set(r.entity, e);
    }
    const SKIP = new Set(["person", "gift", "attendanceSession", "settings"]);
    const nice = (e: string) => e.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
    const features = [
      { label: "Members added", d30: sum(members30), churches: members30.length },
      { label: "Check-ins recorded", d30: sum(att30), churches: att30.length },
      { label: "Gifts recorded", d30: sum(gifts30), churches: gifts30.length },
      { label: "SMS credits used", d30: smsSent, churches: sms30.length },
      ...[...auditByEntity.entries()].filter(([e]) => !SKIP.has(e)).map(([e, v]) => ({ label: nice(e), d30: v.n, churches: v.churches.size })),
    ].filter((f) => f.d30 > 0).sort((a, b) => b.churches - a.churches || b.d30 - a.d30).slice(0, 16);

    return {
      churches,
      signups: { today: todayN, d7: n7, d30: n30, prev30 },
      daily: [...byDay.entries()].map(([date, signups]) => ({ date, signups })),
      active: { d1: a1, d7: a7, d30: a30 },
      funnel: { signedUp: newIds.length, addedMembers: withMembers.length, tookAttendance: withAttendance.length, paid: paidNew },
      plans: subs.map((s) => ({ plan: s.plan, churches: s._count })).sort((a, b) => b.churches - a.churches),
      heardFrom,
      places: mergePlaces(placesRaw),
      features,
      recent: recentChurches.map((c) => ({ name: c.name, city: c.city, country: c.country, heardFrom: c.heardFrom ? (HEARD[c.heardFrom] ?? c.heardFrom) : null, createdAt: c.createdAt.toISOString(), members: c._count.people })),
    };
  });
}
