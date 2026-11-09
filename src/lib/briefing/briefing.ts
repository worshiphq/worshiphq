import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { onlyWithFeature } from "@/lib/plan-gate-batch";
import { ymdInTz, mmddInTz, localParts, timeReached, zonedToUtc } from "@/lib/time/tz";
import { forEachChurch, type Deadline } from "@/lib/automations/pool";
import { absentMembers } from "@/lib/automations/absence";
import { sendEmail } from "@/lib/integrations/email";
import { sendChurchSms } from "@/lib/sms/credits";
import { money } from "@/lib/receipts/types";
import { normalizeBriefing } from "@/lib/briefing/settings";

const DAY = 86400000;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const total = (s: { adults: number; teens: number; children: number; visitors: number }) => s.adults + s.teens + s.children + s.visitors;
const names = (list: string[], n = 5) => list.slice(0, n).join(", ") + (list.length > n ? ` and ${list.length - n} more` : "");

export type Briefing = {
  church: string;
  weekLabel: string;
  service: { name: string; date: string; count: number; change: number | null } | null;
  weekAttendance: number;
  giving: { month: string; thisMonth: number; lastMonthSoFar: number; pct: number | null };
  visitors: { count: number; names: string[] };
  drifting: { count: number; names: string[] };
  birthdays: { count: number; names: string[] };
  followUps: { overdue: number; doneThisWeek: number; open: number };
};

/** Everything a pastor wants to know on Monday morning, from the church's own records. Read-only. */
export async function buildBriefing(churchId: string, now = new Date()): Promise<Briefing | null> {
  const church = await db.church.findUnique({ where: { id: churchId }, select: { name: true, timezone: true } });
  if (!church) return null;
  const tz = church.timezone;
  const today = ymdInTz(now, tz);
  const startToday = zonedToUtc(today, "00:00", tz);
  const weekAgo = new Date(startToday.getTime() - 7 * DAY);
  const twoWeeksAgo = new Date(startToday.getTime() - 14 * DAY);
  const monthStart = zonedToUtc(`${today.slice(0, 8)}01`, "00:00", tz);
  const [y, m] = today.split("-").map(Number);
  const prevYm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const prevStart = zonedToUtc(`${prevYm}-01`, "00:00", tz);
  // Same number of days into last month, so the comparison is fair mid-month.
  const prevSameDay = new Date(prevStart.getTime() + (now.getTime() - monthStart.getTime()));

  const [thisWeek, lastWeek, giveNow, givePrev, visitors, overdue, doneWeek, open, away] = await Promise.all([
    db.attendanceSession.findMany({ where: { churchId, date: { gte: weekAgo, lt: startToday } }, select: { serviceName: true, date: true, adults: true, teens: true, children: true, visitors: true } }),
    db.attendanceSession.findMany({ where: { churchId, date: { gte: twoWeeksAgo, lt: weekAgo } }, select: { adults: true, teens: true, children: true, visitors: true } }),
    db.gift.aggregate({ where: { churchId, date: { gte: monthStart, lte: now } }, _sum: { amount: true } }),
    db.gift.aggregate({ where: { churchId, date: { gte: prevStart, lte: prevSameDay } }, _sum: { amount: true } }),
    db.visitor.findMany({ where: { churchId, visitDate: { gte: weekAgo, lt: startToday } }, select: { firstName: true, lastName: true }, take: 50 }),
    db.followUp.count({ where: { churchId, status: { not: "done" }, dueDate: { lt: startToday } } }),
    db.followUp.count({ where: { churchId, status: "done", completedAt: { gte: weekAgo } } }),
    db.followUp.count({ where: { churchId, status: { not: "done" } } }),
    absentMembers(churchId, 2, tz, now),
  ]);

  const keys = Array.from({ length: 7 }, (_, i) => mmddInTz(now, tz, i));
  const bdays = await db.person.findMany({ where: { churchId, status: { not: "inactive" }, birthday: { in: keys } }, select: { firstName: true, lastName: true, birthday: true } });
  bdays.sort((a, b) => keys.indexOf(a.birthday!) - keys.indexOf(b.birthday!));

  const biggest = thisWeek.sort((a, b) => total(b) - total(a))[0];
  const lastBiggest = lastWeek.reduce((mx, s) => Math.max(mx, total(s)), 0);
  const drifting = away.filter((a) => !a.stale);
  const thisMonth = Number(giveNow._sum.amount ?? 0);
  const lastMonthSoFar = Number(givePrev._sum.amount ?? 0);
  const full = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

  return {
    church: church.name,
    weekLabel: new Date(now).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: tz }),
    service: biggest ? {
      name: biggest.serviceName,
      date: biggest.date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: tz }),
      count: total(biggest),
      change: lastBiggest > 0 ? total(biggest) - lastBiggest : null,
    } : null,
    weekAttendance: thisWeek.reduce((a, s) => a + total(s), 0),
    giving: {
      month: new Date(now).toLocaleDateString("en-GB", { month: "long", timeZone: tz }),
      thisMonth, lastMonthSoFar,
      pct: lastMonthSoFar > 0 ? Math.round((thisMonth / lastMonthSoFar) * 100) : null,
    },
    visitors: { count: visitors.length, names: visitors.map(full) },
    drifting: { count: drifting.length, names: drifting.map((d) => `${d.name} (${d.weeksAway}w)`) },
    birthdays: { count: bdays.length, names: bdays.map(full) },
    followUps: { overdue, doneThisWeek: doneWeek, open },
  };
}

export type BriefingNote = "intro" | "sample" | undefined;

export function briefingSms(b: Briefing, note?: BriefingNote): string {
  const lines = [note === "intro" ? `NEW on WorshipHQ Max! Your Monday briefing - ${b.church}` : note === "sample" ? `A taste of WorshipHQ Max: the Monday briefing - ${b.church}` : `Monday briefing - ${b.church}`];
  if (b.service) lines.push(`${b.service.name}: ${b.service.count}${b.service.change !== null ? ` (${b.service.change >= 0 ? "+" : ""}${b.service.change} vs last wk)` : ""}`);
  else lines.push("No service recorded last week");
  lines.push(`Giving ${b.giving.month}: ${money(b.giving.thisMonth).replace("GH₵", "GHS")}${b.giving.pct !== null ? ` (${b.giving.pct}% of last month so far)` : ""}`);
  lines.push(`New visitors: ${b.visitors.count}`);
  lines.push(`Missing 2+ wks: ${b.drifting.count}`);
  lines.push(`Birthdays this wk: ${b.birthdays.count}`);
  lines.push(`Follow-ups overdue: ${b.followUps.overdue}`);
  return lines.join("\n");
}

export function briefingEmail(b: Briefing, note?: BriefingNote): string {
  const app = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const stat = (label: string, value: string, note = "", tone = "#0d7377") =>
    `<td style="padding:6px;width:50%;vertical-align:top"><div style="border:1px solid #e7e1d4;border-radius:12px;padding:14px 16px;background:#fff">
      <div style="font-size:12px;color:#6b6456;text-transform:uppercase;letter-spacing:.04em">${label}</div>
      <div style="font-size:26px;font-weight:700;color:${tone};margin-top:4px">${value}</div>
      ${note ? `<div style="font-size:13px;color:#6b6456;margin-top:2px">${note}</div>` : ""}</div></td>`;
  const list = (title: string, items: string[], link: string, empty: string) =>
    `<div style="margin-top:18px"><div style="font-weight:700;color:#1c1a16">${title}</div>
      <div style="color:#3d3a33;margin-top:4px;font-size:14px">${items.length ? esc(names(items, 10)) : `<span style="color:#6b6456">${empty}</span>`}</div>
      <a href="${app}${link}" style="font-size:13px;color:#0d7377">Open</a></div>`;
  const svc = b.service;
  const change = svc && svc.change !== null ? `${svc.change >= 0 ? "Up" : "Down"} ${Math.abs(svc.change)} from last week` : "";
  const givePct = b.giving.pct !== null ? `${b.giving.pct}% of last month at this point` : "";
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;color:#1c1a16;background:#fbf8f1;padding:24px;border-radius:16px">
    ${note === "intro" ? `<div style="background:#0d7377;color:#fff;border-radius:12px;padding:14px 16px;margin-bottom:18px"><div style="font-size:12px;font-weight:700;letter-spacing:.1em;color:#e5b567">NEW FOR MAX CHURCHES</div><div style="margin-top:4px;font-size:15px">Here is your first Monday briefing. From now on it arrives every Monday morning with last week's attendance, giving, new visitors, who is missing, birthdays and overdue follow-ups.</div><div style="margin-top:8px;font-size:14px">Choose who receives it, the day and time, and email or SMS on the <a href="${app}/app/reminders" style="color:#e5b567;font-weight:700">Reminders page</a>.</div></div>` : ""}
    ${note === "sample" ? `<div style="background:#1c1a16;color:#fff;border-radius:12px;padding:14px 16px;margin-bottom:18px"><div style="font-size:12px;font-weight:700;letter-spacing:.1em;color:#e5b567">A FREE PREVIEW OF WORSHIPHQ MAX</div><div style="margin-top:4px;font-size:15px">This is the Monday briefing, built from your own church's records. Max churches get it every Monday morning, by email or SMS, for the pastor and leaders.</div><div style="margin-top:10px"><a href="${app}/app/settings?tab=billing" style="background:#e5b567;color:#1c1a16;padding:9px 16px;border-radius:9px;text-decoration:none;font-weight:700">See Max</a></div></div>` : ""}
    <div style="font-size:13px;color:#97742a;font-weight:700;letter-spacing:.08em">YOUR MONDAY BRIEFING</div>
    <h1 style="margin:4px 0 2px;font-size:24px">${esc(b.church)}</h1>
    <div style="color:#6b6456;font-size:14px">${esc(b.weekLabel)}</div>
    <table style="width:100%;border-collapse:collapse;margin-top:16px"><tr>
      ${stat(svc ? esc(svc.name) : "Last week", svc ? String(svc.count) : "-", svc ? `${esc(svc.date)}${change ? `. ${change}` : ""}` : "No service recorded")}
      ${stat(`Giving in ${esc(b.giving.month)}`, esc(money(b.giving.thisMonth)), givePct)}
    </tr><tr>
      ${stat("New visitors", String(b.visitors.count), "last 7 days")}
      ${stat("Missing 2+ weeks", String(b.drifting.count), "regulars who have not come", b.drifting.count ? "#b45309" : "#0d7377")}
    </tr><tr>
      ${stat("Birthdays this week", String(b.birthdays.count))}
      ${stat("Follow-ups overdue", String(b.followUps.overdue), `${b.followUps.doneThisWeek} done this week, ${b.followUps.open} open`, b.followUps.overdue ? "#b45309" : "#0d7377")}
    </tr></table>
    ${list("Who to check on", b.drifting.names, "/app/reminders", "Nobody has missed 2 weeks. Praise God!")}
    ${list("New visitors to welcome", b.visitors.names, "/app/visitors", "No new visitors recorded last week.")}
    ${list("Birthdays this week", b.birthdays.names, "/app/birthdays", "No birthdays this week.")}
    <p style="margin-top:24px"><a href="${app}/app" style="background:#0d7377;color:#fff;padding:11px 20px;border-radius:10px;text-decoration:none;font-weight:600">Open WorshipHQ</a></p>
    <p style="font-size:12px;color:#8a8373;margin-top:18px">Sent every week by WorshipHQ Max. Change who gets it, or the day and time, on the Reminders page.</p>
  </div>`;
}

/** Who gets it: the chosen team members, or every Owner, Admin and Pastor. */
async function recipients(churchId: string, userIds: string[]) {
  const users = await db.user.findMany({
    where: userIds.length ? { churchId, id: { in: userIds } } : { churchId, role: { in: ["Owner", "Admin", "Pastor"] } },
    select: { email: true, phone: true },
  });
  return {
    emails: [...new Set(users.map((u) => u.email).filter((e): e is string => !!e && !e.endsWith("@invite.worshiphq.app")))],
    phones: [...new Set(users.map((u) => u.phone).filter((p): p is string => !!p))],
  };
}

export async function deliverBriefing(churchId: string, b: Briefing, to: { emails: string[]; phones: string[] }, note?: BriefingNote) {
  let emails = 0, texts = 0;
  if (to.emails.length) {
    const r = await sendEmail({ to: to.emails, subject: note === "intro" ? `New for Max: your Monday briefing - ${b.church}` : note === "sample" ? `A preview of WorshipHQ Max: your Monday briefing - ${b.church}` : `Your Monday briefing - ${b.church}`, html: briefingEmail(b, note), log: { churchId, name: "Monday briefing", segment: "briefing" } });
    if (r.ok) emails = to.emails.length;
  }
  if (to.phones.length) {
    const r = await sendChurchSms(churchId, to.phones, briefingSms(b, note), { note: "Monday briefing" });
    texts = r.sent;
  }
  return { emails, texts };
}

/** Hourly: each Max church with the briefing on gets it once, on its chosen day, from its chosen hour. */
export async function runWeeklyBriefing(now = new Date(), ignoreHour = false, deadline?: Deadline) {
  const all = await db.church.findMany({
    where: { isDemo: false, briefing: { not: Prisma.DbNull } },
    select: { id: true, timezone: true, briefing: true },
  });
  // Max churches, plus any church the platform owner sent a one-time sample to.
  const max = new Set((await onlyWithFeature(all, "weekly-briefing")).map((c) => c.id));
  const churches = all.filter((c) => max.has(c.id) || normalizeBriefing(c.briefing).sample);

  let sent = 0;
  const pool = await forEachChurch(churches, async (church) => {
    const cfg = normalizeBriefing(church.briefing);
    const isMax = max.has(church.id);
    if (!(isMax ? cfg.on : cfg.sample) || (!cfg.email && !cfg.sms)) return;
    // The day always counts (the daily fallback run only skips the hour check).
    if (localParts(now, church.timezone).weekday !== cfg.day) return;
    if (!ignoreHour && !timeReached(now, church.timezone, cfg.hour, 0)) return;
    const today = ymdInTz(now, church.timezone);
    const claim = await db.church.updateMany({ where: { id: church.id, OR: [{ briefingSent: null }, { briefingSent: { not: today } }] }, data: { briefingSent: today } });
    if (claim.count === 0) return;
    const b = await buildBriefing(church.id, now);
    if (!b) return;
    const note: BriefingNote = !isMax ? "sample" : cfg.intro ? "intro" : undefined;
    const r = await recipients(church.id, cfg.userIds);
    await deliverBriefing(church.id, b, { emails: cfg.email ? r.emails : [], phones: cfg.sms ? r.phones : [] }, note);
    // Launch notes go out once. A sample to a non-Max church is a single send.
    if (note) {
      const rest = { ...cfg, intro: undefined, sample: undefined, ...(note === "sample" ? { on: false } : {}) };
      await db.church.update({ where: { id: church.id }, data: { briefing: JSON.parse(JSON.stringify(rest)) } });
    }
    sent++;
  }, { deadline, label: "weeklyBriefing" });
  return { churches: churches.length, sent, ...pool };
}
