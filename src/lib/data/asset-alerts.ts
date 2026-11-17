import "server-only";
import { db } from "@/lib/db";
import { ymdInTz, localParts } from "@/lib/time/tz";
import { alertThresholdHit, daysUntil, serviceDue, DEFAULT_THRESHOLDS } from "@/lib/fleet/due";

export type AssetAlertSettings = { on?: boolean; userIds?: string[]; sms?: boolean; days?: number[] };

export function readAlertSettings(raw: unknown): Required<AssetAlertSettings> {
  const o = (raw && typeof raw === "object" ? raw : {}) as AssetAlertSettings;
  const days = Array.isArray(o.days) ? o.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 90) : [];
  return {
    on: o.on !== false,
    userIds: Array.isArray(o.userIds) ? o.userIds.filter((x) => typeof x === "string").slice(0, 30) : [],
    sms: !!o.sms,
    days: days.length ? [...new Set([...days, 0])].sort((a, b) => b - a) : DEFAULT_THRESHOLDS,
  };
}

export type AlertItem = { kind: "paper" | "licence" | "service" | "warranty" | "late" | "urgent"; text: string; urgent: boolean };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const when = (d: number) => (d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`);

/**
 * Everything worth telling the church today about its vehicles and equipment. Pure data: nothing is sent or written.
 * - Papers and licences: on the threshold days, and when overdue only on Mondays (so it is not a daily nag).
 * - Service due by date or km: once per due (the caller marks MaintenanceSchedule.alertedFor with `scheduleKeys`).
 * - Warranty: 30 days before and on the day. Late loans. Urgent faults open more than 2 days.
 */
export async function buildAssetAlerts(churchId: string, now: Date, tz: string, thresholds: number[] = DEFAULT_THRESHOLDS) {
  const today = new Date(`${ymdInTz(now, tz)}T00:00:00Z`);
  const monday = localParts(now, tz).weekday === 1;
  const [vehicles, drivers, schedules, warranties, late, urgent] = await Promise.all([
    db.vehicle.findMany({ where: { churchId, active: true }, select: { regNumber: true, odometerKm: true, insuranceExpires: true, roadworthyExpires: true, registrationExpires: true, asset: { select: { name: true } } } }),
    db.vehicleDriver.findMany({ where: { churchId, licenceExpires: { not: null }, vehicle: { active: true } }, select: { name: true, licenceExpires: true, vehicle: { select: { regNumber: true } } } }),
    db.maintenanceSchedule.findMany({ where: { churchId, active: true, asset: { status: { not: "disposed" } } }, select: { id: true, title: true, everyDays: true, everyKm: true, lastDoneAt: true, lastDoneKm: true, alertedFor: true, asset: { select: { name: true, vehicle: { select: { regNumber: true, odometerKm: true } } } } } }),
    db.asset.findMany({ where: { churchId, warrantyExpires: { not: null }, status: { notIn: ["disposed", "lost"] } }, select: { name: true, warrantyExpires: true } }),
    db.assetCheckout.findMany({ where: { churchId, returnedAt: null, dueAt: { lt: today } }, select: { borrowerName: true, dueAt: true, asset: { select: { name: true } } } }),
    db.maintenanceRequest.findMany({ where: { churchId, priority: "urgent", status: { in: ["open", "assigned", "in-progress"] }, createdAt: { lt: new Date(now.getTime() - 2 * 86400000) } }, select: { title: true, createdAt: true } }),
  ]);

  const items: AlertItem[] = [];
  const paper = (label: string, date: Date | null, who: string, kind: AlertItem["kind"]) => {
    if (!date) return;
    const d = daysUntil(date, today);
    const hit = alertThresholdHit(d, thresholds);
    if (hit === "overdue") { if (monday) items.push({ kind, urgent: true, text: `${who}: ${label} ran out ${plural(-d, "day")} ago` }); }
    else if (hit) items.push({ kind, urgent: d <= 7, text: `${who}: ${label} ends ${when(d)}` });
  };
  for (const v of vehicles) {
    const who = `${v.asset.name} ${v.regNumber}`;
    paper("insurance", v.insuranceExpires, who, "paper");
    paper("roadworthy", v.roadworthyExpires, who, "paper");
    paper("DVLA renewal", v.registrationExpires, who, "paper");
  }
  for (const d of drivers) paper("driving licence", d.licenceExpires, `${d.name} (${d.vehicle.regNumber})`, "licence");

  const scheduleKeys: { id: string; key: string }[] = [];
  for (const s of schedules) {
    const due = serviceDue(s, s.asset.vehicle?.odometerKm ?? null, today);
    if (due.state !== "soon" && due.state !== "overdue") continue;
    const key = `${due.dueAt?.toISOString().slice(0, 10) ?? ""}|${due.dueKm ?? ""}`;
    if (s.alertedFor === key) continue;
    scheduleKeys.push({ id: s.id, key });
    items.push({ kind: "service", urgent: due.state === "overdue", text: `${s.asset.vehicle ? s.asset.vehicle.regNumber : s.asset.name}: ${s.title} ${due.state === "overdue" ? `is overdue (${due.reason})` : `is due ${due.reason}`}` });
  }
  for (const w of warranties) {
    const d = daysUntil(w.warrantyExpires!, today);
    if (d === 30 || d === 0) items.push({ kind: "warranty", urgent: false, text: `${w.name}: warranty ends ${when(d)}` });
  }
  for (const c of late) items.push({ kind: "late", urgent: true, text: `${c.asset.name} is ${plural(-daysUntil(c.dueAt!, today), "day")} late back from ${c.borrowerName}` });
  for (const u of urgent) items.push({ kind: "urgent", urgent: true, text: `Urgent fault still open after ${plural(-daysUntil(u.createdAt, today), "day")}: ${u.title}` });

  items.sort((a, b) => Number(b.urgent) - Number(a.urgent));
  return { items, scheduleKeys, todayYmd: ymdInTz(now, tz) };
}

/** Claim today's alert for a church. False when it already went out today. */
export async function claimAssetAlertDay(churchId: string, todayYmd: string): Promise<boolean> {
  const claim = await db.church.updateMany({
    where: { id: churchId, OR: [{ assetAlertsSent: null }, { assetAlertsSent: { not: todayYmd } }] },
    data: { assetAlertsSent: todayYmd },
  });
  return claim.count > 0;
}
