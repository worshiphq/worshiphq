import { LIVE_CHURCH } from "@/lib/live-church";
import "server-only";
import { db } from "@/lib/db";
import { ymdInTz } from "@/lib/time/tz";
import { onlyWithFeature } from "@/lib/plan-gate-batch";
import { forEachChurch, type Deadline } from "@/lib/automations/pool";
import { sendEmail } from "@/lib/integrations/email";
import { sendChurchSms } from "@/lib/sms/credits";
import { textToHtml } from "@/lib/html";
import { dueReminderMilestones } from "@/lib/levies/calc";
import { toCents, fmtGhs, ZERO } from "@/lib/levies/money";
import { longDate, periodLabel } from "@/lib/levies/periods";
import { ensureRecords, recalcOpen, checkDrift, maybeAutoClose, safeTz } from "@/lib/levies/engine";
import type { Frequency } from "@/lib/levies/types";

const asFreq = (f: string): Frequency => (f === "quarterly" || f === "yearly" ? f : "monthly");

/**
 * The daily levy job, per church with the levies feature:
 *  1. bring records up to date (new periods, open ones recalculated, closed ones checked for changed giving),
 *  2. close fully paid periods that have ended (when the church has that on),
 *  3. remind the chosen team members before each due date and once the day after it is missed.
 * Every reminder milestone is stored on the record, so nothing is sent twice and a missed run catches up with one message.
 * Email always; a text only when the church switched texts on (they use its SMS credits).
 */
export async function runLevyReminders(now = new Date(), deadline?: Deadline) {
  const churches = await onlyWithFeature(
    await db.church.findMany({
      where: { ...LIVE_CHURCH, suspended: false, levyRules: { some: {} } },
      select: { id: true, name: true, timezone: true, levyRemindOn: true, levyRemindDays: true, levyRemindSms: true, levyRemindUserIds: true, levyAutoClose: true },
    }),
    "levies",
  );
  let reminders = 0;
  let closed = 0;

  const pool = await forEachChurch(churches, async (church) => {
    const tz = safeTz(church.timezone);
    const today = ymdInTz(now, tz);
    await ensureRecords(db, church.id, now);
    await recalcOpen(db, church.id, { now });
    await checkDrift(db, church.id, now);

    if (church.levyAutoClose) {
      const ended = await db.levyRecord.findMany({ where: { churchId: church.id, state: "open", periodEnd: { lte: now } }, select: { id: true } });
      for (const r of ended) {
        if (await db.$transaction((tx) => maybeAutoClose(tx, r.id, { autoClose: true, now, tz }))) closed++;
      }
    }

    if (!church.levyRemindOn) return;
    const open = await db.levyRecord.findMany({
      where: { churchId: church.id, periodEnd: { lte: now } },
      select: { id: true, periodKey: true, dueDate: true, amountDue: true, amountPaid: true, remindersSent: true, rule: { select: { name: true, payee: true, frequency: true, yearStartMonth: true } } },
    });
    const items: { line: string; overdue: boolean }[] = [];
    for (const r of open) {
      const left = toCents(r.amountDue.toString()) - toCents(r.amountPaid.toString());
      if (left <= ZERO) continue;
      const dueYmd = ymdInTz(r.dueDate, tz);
      const m = dueReminderMilestones(dueYmd, today, church.levyRemindDays, r.remindersSent);
      if (!m.consume.length) continue;
      await db.levyRecord.update({ where: { id: r.id }, data: { remindersSent: { set: [...r.remindersSent, ...m.consume] } } });
      if (!m.send) continue;
      const label = periodLabel(r.periodKey, asFreq(r.rule.frequency), r.rule.yearStartMonth);
      items.push({
        overdue: m.send === "overdue",
        line: m.send === "overdue"
          ? `${r.rule.name} for ${label} was due on ${longDate(dueYmd)} and is now overdue. Still to pay: ${fmtGhs(left)}.`
          : `${r.rule.name} for ${label} is due on ${longDate(dueYmd)}. Still to pay: ${fmtGhs(left)}.`,
      });
    }
    if (!items.length) return;
    // A church switching levies on with a long backlog gets one short message, not a wall of text.
    if (items.length > 6) {
      const more = items.length - 5;
      items.splice(5, items.length, { overdue: true, line: `And ${more} more period${more === 1 ? "" : "s"} still to pay. See Levies for the full list.` });
    }

    // Who hears: the people the church chose, otherwise the Main Admin, Admins and Finance.
    const users = await db.user.findMany({
      where: church.levyRemindUserIds.length ? { churchId: church.id, id: { in: church.levyRemindUserIds } } : { churchId: church.id, role: { in: ["Owner", "Admin", "Finance"] } },
      select: { email: true, phone: true },
    });
    const emails = [...new Set(users.map((u) => u.email).filter((e): e is string => !!e && !e.endsWith("@invite.worshiphq.app")))];
    const text = `Reminder: ${items.map((i) => i.line).join(" ")}`;
    const subject = items.some((i) => i.overdue) ? "A levy is overdue" : "Levy due soon";
    if (emails.length) {
      await sendEmail({
        to: emails,
        subject: `${subject} - ${church.name}`,
        html: `<p>${items.map((i) => textToHtml(i.line)).join("</p><p>")}</p><p>Record the payment in WorshipHQ, Levies, and attach the receipt so it is kept with the period.</p>`,
        log: { churchId: church.id, name: subject, segment: "admin-alert" },
      }).catch((e: unknown) => console.error("[levies] reminder email failed", e));
    }
    if (church.levyRemindSms) {
      const phones = [...new Set(users.map((u) => u.phone).filter((p): p is string => !!p))];
      if (phones.length) await sendChurchSms(church.id, phones, text.slice(0, 300), { note: "Levy reminder" }).catch(() => null);
    }
    reminders += items.length;
  }, { deadline, label: "levies" });

  return { churches: churches.length, reminders, closed, ...pool };
}
