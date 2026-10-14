import "server-only";
import { db } from "@/lib/db";
import { ymdInTz, localParts } from "@/lib/time/tz";
import { forEachChurch, type Deadline } from "@/lib/automations/pool";
import { sendChurchSms } from "@/lib/sms/credits";
import { renderTemplate, templateFor } from "@/lib/messages/registry";
import { notifyChurchAdmins } from "@/lib/notify/admins";

export type AbsentMember = {
  id: string;
  name: string;
  firstName: string;
  phone: string | null;
  lastSeen: Date;
  weeksAway: number;
  alerted: boolean;
  texted: boolean;
  /** Away much longer than the setting: shown in the list, but not texted automatically. */
  stale: boolean;
};

/**
 * Members who have attended before but have not checked in for `weeks` weeks.
 * Only people who really have a check-in on record can be "away": someone who
 * never attended is not counted. Dates are compared as church-local days, so a
 * member who attended last Sunday is not flagged on this Sunday before service.
 */
export async function absentMembers(churchId: string, weeks: number, timezone: string, now = new Date()): Promise<AbsentMember[]> {
  const w = Math.min(52, Math.max(1, Math.trunc(weeks) || 1));
  const cutoffYmd = ymdInTz(now, timezone, -w * 7);
  const todayYmd = ymdInTz(now, timezone);

  const lastByPerson = await db.attendanceRecord.groupBy({
    by: ["personId"],
    where: { churchId, personId: { not: null } },
    _max: { date: true },
  });
  const last = new Map<string, Date>();
  for (const r of lastByPerson) if (r.personId && r._max.date) last.set(r.personId, r._max.date);
  if (last.size === 0) return [];

  const people = await db.person.findMany({
    where: { churchId, status: "active", id: { in: [...last.keys()] }, OR: [{ ageGroup: null }, { ageGroup: { not: "child" } }] },
    select: { id: true, firstName: true, lastName: true, phone: true, lapsedAlertedAt: true, lapsedSmsSentAt: true },
  });

  const out: AbsentMember[] = [];
  for (const p of people) {
    const seen = last.get(p.id)!;
    if (ymdInTz(seen, timezone) >= cutoffYmd) continue;
    const days = Math.round((Date.parse(`${todayYmd}T00:00:00Z`) - Date.parse(`${ymdInTz(seen, timezone)}T00:00:00Z`)) / 86400000);
    out.push({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      firstName: p.firstName,
      phone: p.phone,
      lastSeen: seen,
      weeksAway: Math.floor(days / 7),
      // They have been dealt with for this absence if it happened after they last attended.
      alerted: !!p.lapsedAlertedAt && p.lapsedAlertedAt > seen,
      texted: !!p.lapsedSmsSentAt && p.lapsedSmsSentAt > seen,
      stale: Math.floor(days / 7) > w + 6,
    });
  }
  return out.sort((a, b) => b.weeksAway - a.weeksAway || a.name.localeCompare(b.name));
}

/**
 * The "we have not seen you in a while" check. For each church that switched it
 * on: text the member (optional) and tell the admins (optional), once per
 * absence. Attending again re-arms it for a future absence.
 */
export async function runAbsenceCheck(now = new Date(), ignoreHour = false, deadline?: Deadline) {
  const churches = await db.church.findMany({
    where: { isDemo: false, absenceOn: true },
    select: { id: true, name: true, timezone: true, absenceWeeks: true, absenceTextMember: true, absenceAlertAdmins: true, messageTemplates: true },
  });

  let texted = 0, alerts = 0;
  const pool = await forEachChurch(churches, async (church) => {
    if (!ignoreHour) {
      const { hour } = localParts(now, church.timezone);
      if (hour < 8 || hour >= 20) return;
    }
    const away = (await absentMembers(church.id, church.absenceWeeks, church.timezone, now)).filter((m) => !m.stale);

    // 1) Text each member who has not been told yet.
    if (church.absenceTextMember) {
      const tpl = templateFor(church.messageTemplates, "absent_member");
      for (const m of away.filter((x) => !x.texted && x.phone)) {
        const msg = renderTemplate(tpl, { name: m.firstName, church: church.name, weeks: String(church.absenceWeeks) });
        const res = await sendChurchSms(church.id, m.phone!, msg, { note: "We miss you (automatic)" });
        if (res.insufficient) break;
        if (res.ok) { texted++; await db.person.update({ where: { id: m.id }, data: { lapsedSmsSentAt: now } }); }
      }
    }

    // 2) One message to the admins listing everyone newly away.
    if (church.absenceAlertAdmins) {
      const fresh = away.filter((x) => !x.alerted);
      if (fresh.length > 0) {
        const shown = fresh.slice(0, 12).map((m) => `${m.name} (${m.weeksAway}w)`).join(", ");
        const list = fresh.length > 12 ? `${shown} and ${fresh.length - 12} more` : shown;
        const msg = renderTemplate(templateFor(church.messageTemplates, "absent_admin"), {
          count: String(fresh.length), church: church.name, list, weeks: String(church.absenceWeeks),
        });
        await notifyChurchAdmins(church.id, { subject: "Members not seen in a while", sms: msg, force: true });
        await db.person.updateMany({ where: { id: { in: fresh.map((m) => m.id) } }, data: { lapsedAlertedAt: now } });
        alerts++;
      }
    }
  }, { deadline, label: "absence" });

  return { churches: churches.length, texted, alerts, ...pool };
}
