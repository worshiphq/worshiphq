import "server-only";
import { db } from "@/lib/db";
import { BILLING_GRACE_DAYS } from "@/lib/plan-gate";
import { logBillingEvent } from "@/lib/billing/events";
import { noticeChurch, notices } from "@/lib/billing/notices";
import { chargeSavedCard, autoRenewEnabled, MAX_FAILURES } from "@/lib/billing/auto-renew";
import { sendOwnerDigest, digestHasNews, OWNER_GROUP_DAYS, type DigestInput } from "@/lib/billing/owner-digest";

const DAY_MS = 86_400_000;
/** Days after period end before a lapsed church actually drops to Free. */
export const GRACE_DAYS = BILLING_GRACE_DAYS;
/** Remind this many days before the renewal date (churches that renew by hand). */
const REMINDER_DAYS = [7, 3, 1];
/** A church on automatic renewal gets one heads-up, this many days before the charge. */
const AUTO_HEADS_UP_DAYS = 3;

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Daily billing maintenance, in this order for each church:
 *   1. A scheduled downgrade whose period has ended is applied (no money moves).
 *   2. A church on automatic renewal is charged on its renewal date.
 *   3. A church that renews by hand is reminded at 7, 3 and 1 days.
 *   4. Anything unpaid past its end is marked past_due, then dropped to Free after the grace days.
 * Then the platform owner gets ONE digest of everything that needs knowing.
 *
 * `status === "grace"` means a Gift of Grace (a permanent gift): those are skipped entirely and never downgraded.
 *
 * `dryRun` does everything except act: no message is sent, no card is charged, nothing is written. It
 * returns what it WOULD have done, so the logic can be checked against real data without touching anyone.
 */
export async function runBillingCycle(opts: { dryRun?: boolean; /** Pretend it is this moment. For checking the logic against real data without waiting. */ now?: Date } = {}) {
  const dry = !!opts.dryRun;
  const now = opts.now ?? new Date();
  const would: string[] = [];
  const counts = { downgraded: 0, reminded: 0, lapsed: 0, expired: 0, autoRenewed: 0, autoFailed: 0 };
  const digest: DigestInput = { upcoming: [], newlyExpired: [], newlyLapsed: [], autoFailed: [], autoRenewed: [] };

  const { getPlatformConfig } = await import("@/lib/data/platform-config");
  const cfg = await getPlatformConfig();
  const priceGhs = (plan: string, interval: string) => {
    const p = cfg.prices[plan];
    return Math.round((interval === "yearly" ? (p?.yearly ?? 0) : (p?.monthly ?? 0)) * cfg.usdToGhsRate);
  };

  const subs = await db.subscription.findMany({
    where: { status: { not: "grace" } },
    include: { church: { select: { id: true, name: true, isDemo: true } } },
  });

  for (const sub of subs) {
    if (sub.church.isDemo) continue;
    const periodEnd = sub.renewsAt;
    if (!periodEnd || sub.plan === "free") continue;
    const name = sub.church.name;

    try {
      const ended = periodEnd.getTime() <= now.getTime();
      const daysLeft = Math.ceil((periodEnd.getTime() - now.getTime()) / DAY_MS);
      const daysOver = ended ? Math.floor((now.getTime() - periodEnd.getTime()) / DAY_MS) : 0;
      const interval = sub.interval === "yearly" ? "yearly" : "monthly";

      // Automatic renewal applies when the church opted in, still has a card on file, has not run out of
      // tries, and no downgrade or cancellation is waiting (it would be charged for something it left).
      const auto = sub.autoRenew && !!sub.cardId && sub.renewalFailures < MAX_FAILURES && autoRenewEnabled();

      // ── 1. Period ended with a scheduled change → apply it, no money moves ──
      if (ended && (sub.scheduledPlan || sub.cancelAtPeriodEnd)) {
        const nextPlan = sub.cancelAtPeriodEnd ? "free" : sub.scheduledPlan!;
        would.push(`${name}: apply scheduled move ${sub.plan} -> ${nextPlan}`);
        if (!dry) {
          // Free has no billing period. A paid step-down has NOT been paid for yet: it moves to the cheaper
          // plan as due for renewal (past_due), so the usual grace days apply until the church pays for it.
          await db.subscription.update({
            where: { churchId: sub.churchId },
            data: {
              plan: nextPlan,
              status: nextPlan === "free" ? "active" : "past_due",
              scheduledPlan: null,
              scheduledAt: null,
              cancelAtPeriodEnd: false,
              renewalRemindersSent: { set: [] },
              ...(nextPlan === "free" ? { renewsAt: null, periodStart: null, autoRenew: false } : {}),
            },
          });
        }
        counts.downgraded++;
        if (!dry) await noticeChurch(sub.churchId, notices.downgraded(titleCase(nextPlan), GRACE_DAYS));
        // A church on automatic renewal that stepped down to a cheaper paid plan is charged for it now.
        if (nextPlan !== "free" && auto) {
          would.push(`${name}: charge saved card for ${nextPlan} ${interval}`);
          if (!dry) await runAutoCharge(sub.churchId, name, nextPlan, interval, counts, digest, priceGhs);
        }
        continue;
      }

      // ── 2. Automatic renewal: charge on the renewal day, and retry through the grace days ──
      if (auto && !sub.scheduledPlan && !sub.cancelAtPeriodEnd && periodEnd.getTime() - now.getTime() <= DAY_MS && daysOver < GRACE_DAYS) {
        would.push(`${name}: charge saved card for ${sub.plan} ${interval} (about ₵${priceGhs(sub.plan, interval)})`);
        if (!dry) {
          const renewed = await runAutoCharge(sub.churchId, name, sub.plan, interval, counts, digest, priceGhs);
          if (renewed === "renewed" || renewed === "pending") continue;
        } else {
          continue;
        }
        // Failed: fall through to the reminder / grace handling below so the church is still told.
      }

      // ── 3. Reminders ──
      if (!ended && daysLeft > 0) {
        // A church that renews automatically gets one heads-up; everyone else gets 7, 3 and 1.
        const autoReady = auto && sub.renewalFailures === 0;
        const milestones = autoReady ? [AUTO_HEADS_UP_DAYS] : REMINDER_DAYS;
        const due = milestones.filter((d) => daysLeft <= d && !sub.renewalRemindersSent.includes(String(d)));
        if (due.length) {
          would.push(`${name}: remind (${daysLeft} day${daysLeft === 1 ? "" : "s"} left${autoReady ? ", automatic" : ""})`);
          if (!dry) {
            let notice;
            if (autoReady) {
              const card = sub.cardId ? await db.savedCard.findFirst({ where: { id: sub.cardId }, select: { last4: true } }) : null;
              notice = notices.willAutoRenew(titleCase(sub.plan), periodEnd, card?.last4 ?? "----", `₵${priceGhs(sub.plan, interval).toLocaleString()}`);
            } else {
              notice = notices.renewSoon(titleCase(sub.plan), daysLeft, periodEnd);
            }
            const res = await noticeChurch(sub.churchId, notice);
            // Only a reminder that actually reached someone is marked as sent. Before, it was marked sent
            // even when the text failed, so a church that could not be reached was never tried again.
            if (res.delivered) {
              await db.subscription.update({
                where: { churchId: sub.churchId },
                data: { renewalRemindersSent: { set: [...new Set([...sub.renewalRemindersSent, ...due.map(String)])] } },
              });
              counts.reminded++;
            }
          } else {
            counts.reminded++;
          }
        }
        continue;
      }

      // ── 4. Period ended, nothing scheduled, still on a paid plan ──
      if (ended) {
        if (daysOver >= GRACE_DAYS) {
          would.push(`${name}: drop ${sub.plan} -> free (${daysOver} days overdue)`);
          if (!dry) {
            await db.subscription.update({
              where: { churchId: sub.churchId },
              data: { plan: "free", status: "active", renewsAt: null, periodStart: null, autoRenew: false, renewalRemindersSent: { set: [] }, renewalFailures: 0 },
            });
            await noticeChurch(sub.churchId, notices.lapsed());
          }
          counts.lapsed++;
          digest.newlyLapsed.push({ name, plan: sub.plan });
        } else if (sub.status !== "past_due") {
          would.push(`${name}: mark expired (past_due), ${GRACE_DAYS} days of grace`);
          if (!dry) {
            await db.subscription.update({ where: { churchId: sub.churchId }, data: { status: "past_due" } });
            await noticeChurch(sub.churchId, notices.expired(titleCase(sub.plan), GRACE_DAYS));
          }
          counts.expired++;
          digest.newlyExpired.push({ name, plan: sub.plan });
        }
      }
    } catch (e) {
      // One church's failure must not stop the rest of the run.
      console.error(`[billing] ${name} failed:`, (e as Error).message);
    }
  }

  // ── Owner digest: one message, only when there is news ──
  // Re-read the dates so churches renewed or changed above are not announced from stale data.
  const fresh = dry ? subs : await db.subscription.findMany({
    where: { status: { not: "grace" }, plan: { not: "free" }, renewsAt: { not: null } },
    include: { church: { select: { id: true, name: true, isDemo: true } } },
  });
  for (const s of fresh) {
    if (s.church.isDemo || !s.renewsAt || s.plan === "free") continue;
    const daysLeft = Math.ceil((s.renewsAt.getTime() - now.getTime()) / DAY_MS);
    if (daysLeft <= 0 || daysLeft > OWNER_GROUP_DAYS) continue;
    const interval = s.interval === "yearly" ? "yearly" : "monthly";
    digest.upcoming.push({
      churchId: s.churchId, name: s.church.name, plan: s.plan, interval, renewsAt: s.renewsAt, daysLeft,
      auto: s.autoRenew && !!s.cardId, priceGhs: priceGhs(s.plan, interval),
      isNew: s.ownerAlertedFor?.getTime() !== s.renewsAt.getTime(),
    });
  }

  let digestSent: { delivered: boolean; email: boolean; sms: boolean } | null = null;
  if (digestHasNews(digest)) {
    would.push(`OWNER DIGEST: ${digest.upcoming.length} upcoming (${digest.upcoming.filter((r) => r.isNew).length} new), ${digest.newlyExpired.length} expired, ${digest.newlyLapsed.length} lapsed, ${digest.autoFailed.length} failed charges`);
    if (!dry) {
      digestSent = await sendOwnerDigest(digest);
      // Only mark churches as announced if the owner was actually reached, so a failed send tries again tomorrow.
      if (digestSent.delivered) {
        for (const r of digest.upcoming.filter((u) => u.isNew)) {
          await db.subscription.update({ where: { churchId: r.churchId }, data: { ownerAlertedFor: r.renewsAt } }).catch(() => {});
        }
      }
    }
  }

  return { dryRun: dry, ...counts, digest: digestSent, ...(dry ? { would, digestPreview: digest } : {}) };
}

/** Charge a saved card and deal with the outcome (notice, log, retry counter). Returns what happened. */
async function runAutoCharge(
  churchId: string,
  name: string,
  plan: string,
  interval: "monthly" | "yearly",
  counts: { autoRenewed: number; autoFailed: number },
  digest: DigestInput,
  priceGhs: (plan: string, interval: string) => number,
): Promise<"renewed" | "pending" | "failed" | "skipped"> {
  const out = await chargeSavedCard(churchId, plan, interval);

  if (out.status === "renewed") {
    counts.autoRenewed++;
    digest.autoRenewed.push({ name, amountGhs: out.amountGhs });
    await noticeChurch(churchId, notices.autoRenewed(titleCase(plan), `₵${out.amountGhs.toLocaleString()}`, out.renewsAt ?? new Date()));
    return "renewed";
  }
  if (out.status === "pending") return "pending";
  if (out.status === "skipped") return "skipped";

  counts.autoFailed++;
  digest.autoFailed.push({ name, reason: out.reason });
  await db.subscription.update({ where: { churchId }, data: { renewalFailures: out.failures } }).catch(() => {});
  const card = await db.subscription
    .findUnique({ where: { churchId }, select: { cardId: true } })
    .then((s) => (s?.cardId ? db.savedCard.findFirst({ where: { id: s.cardId }, select: { last4: true } }) : null))
    .catch(() => null);
  await logBillingEvent(churchId, { kind: "auto_renew_failed", title: "Automatic renewal failed", detail: out.reason, delivered: false });
  await noticeChurch(churchId, notices.autoRenewFailed(titleCase(plan), card?.last4 ?? "----", !out.giveUp));
  return "failed";
}
