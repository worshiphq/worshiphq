import Link from "@/components/ui/app-link";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { db } from "@/lib/db";

const DAY = 86_400_000;
const GRACE_DAYS = 7;
const SHOW_WITHIN_DAYS = 7;

/**
 * A slim notice, for the Main Admin only, when the plan has expired or is about to end.
 *
 * `past_due` (a plan that expired and is in its grace days) used to be invisible inside the app: the church
 * kept seeing a normal screen right up until the day it dropped to Free. A church on automatic renewal sees
 * nothing here, because nothing needs doing, unless its last charge failed.
 */
export async function BillingBanner({ churchId }: { churchId: string }) {
  const sub = await db.subscription.findUnique({
    where: { churchId },
    select: { plan: true, status: true, renewsAt: true, scheduledPlan: true, cancelAtPeriodEnd: true, autoRenew: true, cardId: true, renewalFailures: true },
  });
  if (!sub || sub.plan === "free" || sub.status === "grace" || !sub.renewsAt) return null;
  if (sub.scheduledPlan || sub.cancelAtPeriodEnd) return null; // they chose to move; nothing to nag about

  const msLeft = sub.renewsAt.getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / DAY);
  const ended = msLeft <= 0;
  const autoOn = sub.autoRenew && !!sub.cardId;
  const failed = (sub.renewalFailures ?? 0) > 0;
  if (!ended && (daysLeft > SHOW_WITHIN_DAYS || (autoOn && !failed))) return null;

  const plan = sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1);
  const graceLeft = Math.max(0, GRACE_DAYS - Math.floor(-msLeft / DAY));
  const text = ended
    ? `Your ${plan} plan has expired. ${graceLeft > 0 ? `You have ${graceLeft} day${graceLeft === 1 ? "" : "s"} to renew before your church moves to Free.` : "Renew to switch your features back on."}`
    : failed
      ? `We could not charge your card to renew ${plan}. It ends ${daysLeft <= 1 ? "tomorrow" : `in ${daysLeft} days`}, so please renew now.`
      : `Your ${plan} plan ends ${daysLeft <= 1 ? "tomorrow" : `in ${daysLeft} days`}. Renew now and no days are lost.`;

  const Icon = ended || failed ? AlertTriangle : CalendarClock;
  return (
    <div
      role="status"
      className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        ended || failed ? "border-danger/30 bg-danger/10 text-danger" : "border-warning/30 bg-warning/10 text-warning"
      }`}
    >
      <span className="flex items-center gap-2"><Icon className="size-4 shrink-0" />{text}</span>
      <Link href="/app/settings?tab=billing" className="shrink-0 rounded-lg bg-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-sm hover:bg-surface-2">
        Renew now
      </Link>
    </div>
  );
}
