import "server-only";
import { db } from "@/lib/db";
import { sendChurchSms } from "@/lib/sms/credits";

const DAY_MS = 86_400_000;
/** Days after period end before a lapsed church actually drops to Free. */
const GRACE_DAYS = 7;
/** Remind this many days before the renewal date. */
const REMINDER_DAYS = [7, 3, 1];

/**
 * Daily billing maintenance:
 *   1. Apply scheduled downgrades whose period has ended.
 *   2. Remind churches their renewal is coming (we don't auto-charge).
 *   3. Mark unpaid periods past_due, then drop to Free after the grace window.
 *
 * `status === "grace"` means *Gift of Grace* (a permanent free gift) — those
 * subscriptions are skipped entirely and must never be downgraded.
 */
export async function runBillingCycle() {
  const now = new Date();
  let downgraded = 0;
  let reminded = 0;
  let lapsed = 0;

  const subs = await db.subscription.findMany({
    where: { status: { not: "grace" } },
    include: { church: { select: { id: true, name: true, isDemo: true } } },
  });

  for (const sub of subs) {
    if (sub.church.isDemo) continue;
    const periodEnd = sub.renewsAt;
    if (!periodEnd) continue;

    const ended = periodEnd.getTime() <= now.getTime();
    const daysLeft = Math.ceil((periodEnd.getTime() - now.getTime()) / DAY_MS);

    // ── 1. Period ended with a scheduled change → apply it, no money moves ──
    if (ended && (sub.scheduledPlan || sub.cancelAtPeriodEnd)) {
      const nextPlan = sub.cancelAtPeriodEnd ? "free" : sub.scheduledPlan!;
      await db.subscription.update({
        where: { churchId: sub.churchId },
        data: {
          plan: nextPlan,
          status: "active",
          scheduledPlan: null,
          scheduledAt: null,
          cancelAtPeriodEnd: false,
          renewalRemindersSent: { set: [] },
          // Free has no billing period; a paid step-down starts a fresh one.
          ...(nextPlan === "free"
            ? { renewsAt: null, periodStart: null }
            : { periodStart: now, renewsAt: nextPeriodEnd(now, sub.interval) }),
        },
      });
      downgraded++;
      await notify(sub.churchId, `Your WorshipHQ plan has moved to ${titleCase(nextPlan)} as scheduled.`);
      continue;
    }

    // ── 2. Renewal reminders (manual re-payment model) ──
    if (!ended && sub.plan !== "free" && daysLeft > 0) {
      const due = REMINDER_DAYS.filter((d) => daysLeft <= d && !sub.renewalRemindersSent.includes(String(d)));
      if (due.length) {
        await notify(
          sub.churchId,
          `Your WorshipHQ ${titleCase(sub.plan)} plan renews in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}. Sign in to renew and keep your features.`,
        );
        await db.subscription.update({
          where: { churchId: sub.churchId },
          data: { renewalRemindersSent: { set: [...sub.renewalRemindersSent, ...due.map(String)] } },
        });
        reminded++;
      }
      continue;
    }

    // ── 3. Period ended, nothing scheduled, still on a paid plan ──
    if (ended && sub.plan !== "free") {
      const daysOver = Math.floor((now.getTime() - periodEnd.getTime()) / DAY_MS);
      if (daysOver >= GRACE_DAYS) {
        await db.subscription.update({
          where: { churchId: sub.churchId },
          data: {
            plan: "free", status: "active", renewsAt: null, periodStart: null,
            renewalRemindersSent: { set: [] },
          },
        });
        lapsed++;
        await notify(sub.churchId, `Your WorshipHQ subscription has ended and your church is now on the Free plan. Sign in any time to resubscribe.`);
      } else if (sub.status !== "past_due") {
        await db.subscription.update({ where: { churchId: sub.churchId }, data: { status: "past_due" } });
        await notify(sub.churchId, `Your WorshipHQ plan has expired. Renew within ${GRACE_DAYS} days to keep your features.`);
      }
    }
  }

  return { downgraded, reminded, lapsed };
}

function nextPeriodEnd(from: Date, interval: string): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + (interval === "yearly" ? 12 : 1));
  return d;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Text the church owner. Best-effort — never blocks the cycle. */
async function notify(churchId: string, message: string) {
  try {
    const owner = await db.user.findFirst({
      where: { churchId, role: "Owner", phone: { not: null } },
      select: { phone: true },
    });
    if (owner?.phone) await sendChurchSms(churchId, owner.phone, message, { note: "Billing" });
  } catch {
    /* notification failures must not stop billing maintenance */
  }
}
