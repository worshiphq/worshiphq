import "server-only";
import { db } from "@/lib/db";
import { sendChurchSms } from "@/lib/sms/credits";
import { DEFAULT_PLEDGE_REMINDER_TEMPLATE, money, fill } from "@/lib/pledges/templates";

const DAY_MS = 86_400_000;

/**
 * Send due-date reminders for outstanding pledges, honouring each church's
 * configured schedule (e.g. 30 / 7 / 3 days before). Each milestone fires at
 * most once per pledge — already-passed milestones are consumed together so a
 * late run doesn't blast several texts at the same person.
 */
export async function runPledgeReminders() {
  const churches = await db.church.findMany({
    where: { isDemo: false },
    select: { id: true, name: true, pledgeReminderDays: true, pledgeReminderTemplate: true },
  });

  let sent = 0;
  let considered = 0;

  for (const church of churches) {
    const schedule = (church.pledgeReminderDays ?? []).filter((d) => d > 0).sort((a, b) => b - a);
    if (!schedule.length) continue;

    const pledges = await db.pledge.findMany({
      where: {
        churchId: church.id,
        dueAt: { not: null },
        donorPhone: { not: null },
      },
      select: {
        id: true, donorName: true, donorPhone: true, amount: true,
        fulfilled: true, dueAt: true, remindersSent: true,
      },
    });

    for (const p of pledges) {
      if (!p.dueAt || !p.donorPhone) continue;
      const balance = Number(p.amount) - Number(p.fulfilled);
      if (balance <= 0) continue; // fully paid — nothing to chase

      const daysUntil = Math.ceil((p.dueAt.getTime() - Date.now()) / DAY_MS);
      if (daysUntil < 0) continue; // past due; don't nag automatically

      considered++;
      const due = schedule.filter((d) => daysUntil <= d && !p.remindersSent.includes(String(d)));
      if (!due.length) continue;

      const msg = fill(church.pledgeReminderTemplate || DEFAULT_PLEDGE_REMINDER_TEMPLATE, {
        name: p.donorName,
        total: money(Number(p.amount)),
        balance: money(balance),
        church: church.name,
        days: String(daysUntil),
      });

      const res = await sendChurchSms(church.id, p.donorPhone, msg, { note: "Pledge reminder" });
      if (res.ok) sent++;

      // Consume every milestone we've reached so it never double-sends.
      await db.pledge.update({
        where: { id: p.id },
        data: { remindersSent: { set: [...p.remindersSent, ...due.map(String)] } },
      });
    }
  }

  return { considered, sent };
}
