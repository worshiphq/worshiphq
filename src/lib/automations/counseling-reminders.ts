import "server-only";
import { db } from "@/lib/db";
import { localParts } from "@/lib/time/tz";
import { forEachChurch, type Deadline } from "@/lib/automations/pool";
import { sendCounselingText } from "@/lib/counseling/text";

const DAY = 86400000;

/**
 * Text people the day before their counselling appointment. Only sessions that
 * are booked, still open, and set to text the person; each is reminded once
 * (reminderSentAt), and moving the appointment re-arms it. The hourly pass
 * stays within 8am to 8pm church time so nobody is woken by a reminder.
 */
export async function runCounselingReminders(now = new Date(), ignoreHour = false, deadline?: Deadline) {
  const churches = await db.church.findMany({
    where: {
      isDemo: false,
      counselingSessions: { some: { textUpdates: true, reminderSentAt: null, status: { not: "closed" }, scheduledAt: { gt: now, lte: new Date(now.getTime() + DAY) } } },
    },
    select: { id: true, timezone: true },
  });

  let sent = 0;
  const pool = await forEachChurch(churches, async (church) => {
    if (!ignoreHour) {
      const { hour } = localParts(now, church.timezone);
      if (hour < 8 || hour >= 20) return;
    }
    const due = await db.counselingSession.findMany({
      where: { churchId: church.id, textUpdates: true, reminderSentAt: null, status: { not: "closed" }, scheduledAt: { gt: now, lte: new Date(now.getTime() + DAY) } },
      select: { id: true },
      take: 200,
    });
    for (const s of due) {
      // Claim it first so two overlapping runs cannot both send.
      const claim = await db.counselingSession.updateMany({ where: { id: s.id, reminderSentAt: null }, data: { reminderSentAt: now } });
      if (claim.count === 0) continue;
      const res = await sendCounselingText({ churchId: church.id, sessionId: s.id, kind: "reminder", sentBy: "Automatic reminder" });
      if (res.ok) sent++;
      else await db.counselingSession.updateMany({ where: { id: s.id }, data: { reminderSentAt: null } }); // try again next hour
    }
  }, { deadline, label: "counselingReminders" });

  return { churches: churches.length, sent, ...pool };
}
