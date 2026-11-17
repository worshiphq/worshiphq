import { LIVE_CHURCH } from "@/lib/live-church";
import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { onlyWithFeature } from "@/lib/plan-gate-batch";
import { timeReached } from "@/lib/time/tz";
import { sendEmail } from "@/lib/integrations/email";
import { forEachChurch, type Deadline } from "@/lib/automations/pool";
import { buildAssetAlerts, claimAssetAlertDay, readAlertSettings, type AlertItem } from "@/lib/data/asset-alerts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const real = (e: string | null | undefined): e is string => !!e && !e.endsWith("@invite.worshiphq.app");

function emailBody(churchName: string, items: AlertItem[]) {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const li = (i: AlertItem) => `<li style="margin:6px 0">${i.urgent ? '<strong style="color:#b45309">' : "<span>"}${esc(i.text)}${i.urgent ? "</strong>" : "</span>"}</li>`;
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#1c1a16">
    <h2 style="margin:0 0 6px;color:#0d7377">Vehicles and equipment</h2>
    <p style="margin:0 0 14px;color:#6b6456">${esc(churchName)}</p>
    <ul style="padding-left:18px">${items.map(li).join("")}</ul>
    <p style="margin-top:18px"><a href="${base}/app/vehicles" style="background:#0d7377;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Open vehicles</a>
    <a href="${base}/app/assets" style="margin-left:8px;color:#0d7377;font-weight:600">Open assets</a></p>
  </div>`;
}

export type AlertDeps = {
  send?: (to: string[], subject: string, html: string) => Promise<boolean>;
  sms?: (churchId: string, to: string[], text: string) => Promise<void>;
};

/**
 * Once a day per church (from 8am local): papers and licences running out, services due, warranties, late loans and
 * urgent faults. Email always; one short text only when the church switched SMS on (it costs their credits).
 * Copied from runFollowUpDigest: plan filter, a per-day claim on Church.assetAlertsSent, and the shared deadline.
 */
export async function runAssetAlerts(now = new Date(), ignoreHour = false, deadline?: Deadline, deps: AlertDeps = {}) {
  const candidates = await db.church.findMany({
    where: {
      ...LIVE_CHURCH,
      OR: [
        { vehicles: { some: { active: true } } },
        { maintenanceSchedules: { some: { active: true } } },
        { assetCheckouts: { some: { returnedAt: null, dueAt: { not: null } } } },
        { assets: { some: { warrantyExpires: { not: null } } } },
        { maintenanceRequests: { some: { priority: "urgent", status: { in: ["open", "assigned", "in-progress"] } } } },
      ],
    },
    select: { id: true, name: true, timezone: true, assetAlerts: true },
  });
  const seen = new Set<string>();
  const churches = [
    ...(await onlyWithFeature(candidates, "vehicles")),
    ...(await onlyWithFeature(candidates, "assets")),
    ...(await onlyWithFeature(candidates, "maintenance")),
  ].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));

  const send = deps.send ?? (async (to: string[], subject: string, html: string) => (await sendEmail({ to, subject, html })).ok);
  const sms = deps.sms ?? (async (churchId: string, to: string[], text: string) => {
    const { sendChurchSms } = await import("@/lib/sms/credits");
    await sendChurchSms(churchId, to, text, { note: "Vehicles and equipment alert" });
  });

  let emails = 0, texts = 0;
  const pool = await forEachChurch(churches, async (church) => {
    const settings = readAlertSettings(church.assetAlerts);
    if (!settings.on) return;
    if (!ignoreHour && !timeReached(now, church.timezone, 8, 0)) return;
    const built = await buildAssetAlerts(church.id, now, church.timezone, settings.days);
    if (built.items.length === 0) return;
    if (!(await claimAssetAlertDay(church.id, built.todayYmd))) return;
    for (const s of built.scheduleKeys) await db.maintenanceSchedule.updateMany({ where: { id: s.id, churchId: church.id }, data: { alertedFor: s.key } });

    const users = await db.user.findMany({
      where: { churchId: church.id, ...(settings.userIds.length ? { id: { in: settings.userIds } } : { role: { in: ["Owner", "Admin", "Pastor"] } }) },
      select: { email: true, phone: true },
    });
    const to = [...new Set(users.map((u) => u.email).filter(real))];
    if (to.length && (await send(to, `${built.items.length} vehicle and equipment item${built.items.length === 1 ? "" : "s"} today - ${church.name}`, emailBody(church.name, built.items)))) emails++;

    if (settings.sms) {
      const phones = [...new Set(users.map((u) => u.phone).filter((p): p is string => !!p))];
      if (phones.length) {
        const first = built.items[0].text;
        const more = built.items.length - 1;
        await sms(church.id, phones, `WorshipHQ: ${first}.${more > 0 ? ` ${more} more item${more === 1 ? "" : "s"} in your email.` : ""}`);
        texts++;
      }
    }
  }, { deadline, label: "assetAlerts" });

  return { churches: churches.length, emails, texts, ...pool };
}
