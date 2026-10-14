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
  /** How many texts went out for this absence so far. */
  textCount: number;
  lastTextAt: Date | null;
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
    select: { id: true, firstName: true, lastName: true, phone: true, lapsedAlertedAt: true, lapsedSmsSentAt: true, lapsedSmsCount: true },
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
      // Texts only count for the current absence: attending again starts the count over.
      textCount: p.lapsedSmsSentAt && p.lapsedSmsSentAt > seen ? Math.max(1, p.lapsedSmsCount) : 0,
      lastTextAt: p.lapsedSmsSentAt && p.lapsedSmsSentAt > seen ? p.lapsedSmsSentAt : null,
      stale: Math.floor(days / 7) > w + 6,
    });
  }
  return out.sort((a, b) => b.weeksAway - a.weeksAway || a.name.localeCompare(b.name));
}

/** Is this away member due a text? First text unless they have been away for ages; repeats only up to the limit and after the gap. */
export function textDue(m: Pick<AbsentMember, "textCount" | "lastTextAt" | "stale">, maxTexts: number, gapMs: number, now: Date) {
  if (m.textCount === 0) return !m.stale;
  return m.textCount < maxTexts && !!m.lastTextAt && now.getTime() - m.lastTextAt.getTime() >= gapMs;
}

/**
 * The "we have not seen you in a while" check. For each church that switched it
 * on: text the member (optional), tell the chosen team members (optional) and
 * open follow-ups (optional). A member is texted at most `absenceMaxTexts` times
 * for one absence, `absenceRepeatWeeks` apart (default: once). The team is told
 * once per absence. Attending again re-arms everything for a future absence.
 */
export async function runAbsenceCheck(now = new Date(), ignoreHour = false, deadline?: Deadline) {
  const churches = await db.church.findMany({
    where: { isDemo: false, absenceOn: true },
    select: {
      id: true, name: true, timezone: true, absenceWeeks: true, absenceTextMember: true, absenceAlertAdmins: true,
      absenceMaxTexts: true, absenceRepeatWeeks: true, absenceCreateFollowUp: true, absenceNotifyUserIds: true,
      followUpAssigneeId: true, messageTemplates: true,
    },
  });

  let texted = 0, alerts = 0, followUps = 0;
  const pool = await forEachChurch(churches, async (church) => {
    if (!ignoreHour) {
      const { hour } = localParts(now, church.timezone);
      if (hour < 8 || hour >= 20) return;
    }
    const all = await absentMembers(church.id, church.absenceWeeks, church.timezone, now);
    const maxTexts = Math.min(5, Math.max(1, church.absenceMaxTexts));
    const gap = Math.max(1, church.absenceRepeatWeeks) * 7 * 86400000;

    // 1) Text members who are due a message (never more than the limit).
    if (church.absenceTextMember) {
      const tpl = templateFor(church.messageTemplates, "absent_member");
      const due = all.filter((m) => !!m.phone && textDue(m, maxTexts, gap, now));
      for (const m of due) {
        const msg = renderTemplate(tpl, { name: m.firstName, church: church.name, weeks: String(church.absenceWeeks) });
        const res = await sendChurchSms(church.id, m.phone!, msg, { note: m.textCount ? "We miss you (reminder)" : "We miss you (automatic)" });
        if (res.insufficient) break;
        if (res.ok) { texted++; await db.person.update({ where: { id: m.id }, data: { lapsedSmsSentAt: now, lapsedSmsCount: m.textCount + 1 } }); }
      }
    }

    // 2) Tell the team once, and open follow-ups for everyone newly away.
    const fresh = all.filter((x) => !x.alerted && !x.stale);
    if (fresh.length === 0) return;

    const team = church.absenceNotifyUserIds.length
      ? (await db.user.findMany({ where: { churchId: church.id, id: { in: church.absenceNotifyUserIds } }, select: { id: true } })).map((u) => u.id)
      : [];
    const assignTo = team.length ? team : church.followUpAssigneeId ? [church.followUpAssigneeId] : [];

    if (church.absenceCreateFollowUp) {
      const valid = assignTo.length ? (await db.user.findMany({ where: { churchId: church.id, id: { in: assignTo } }, select: { id: true } })).map((u) => u.id) : [];
      for (const m of fresh) {
        const open = await db.followUp.findFirst({ where: { churchId: church.id, personId: m.id, type: "pastoral", status: { not: "done" } }, select: { id: true } });
        if (open) continue;
        await db.followUp.create({
          data: {
            churchId: church.id, personId: m.id, type: "pastoral",
            title: `Check on ${m.name}`,
            note: `Has not been seen at church for ${m.weeksAway} week${m.weeksAway === 1 ? "" : "s"}. Please reach out, listen, and record what you find.`,
            dueDate: new Date(now.getTime() + 3 * 86400000),
            assigneeId: valid[0] ?? null,
            ...(valid.length ? { assignees: { create: valid.map((userId) => ({ userId })) } } : {}),
          },
        });
        followUps++;
      }
    }

    if (church.absenceAlertAdmins) {
      const shown = fresh.slice(0, 12).map((m) => `${m.name} (${m.weeksAway}w)`).join(", ");
      const list = fresh.length > 12 ? `${shown} and ${fresh.length - 12} more` : shown;
      const msg = renderTemplate(templateFor(church.messageTemplates, "absent_admin"), {
        count: String(fresh.length), church: church.name, list, weeks: String(church.absenceWeeks),
      });
      await notifyChurchAdmins(church.id, { subject: "Members not seen in a while", sms: msg, force: true, userIds: team.length ? team : undefined });
      alerts++;
    }
    await db.person.updateMany({ where: { id: { in: fresh.map((m) => m.id) } }, data: { lapsedAlertedAt: now } });
  }, { deadline, label: "absence" });

  return { churches: churches.length, texted, alerts, followUps, ...pool };
}
