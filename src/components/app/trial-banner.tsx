import Link from "@/components/ui/app-link";
import { Clock, Sparkles } from "lucide-react";
import { getChurchTrial } from "@/lib/trials";

const DAY = 86_400_000;
/** After a trial ends, keep nudging for this many days. */
const NUDGE_DAYS = 7;

const label = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

/**
 * A slim notice for the Main Admin about the free trial: days left while it runs, and a nudge for a week after it
 * ends. Nothing shows once the church has upgraded, or long after it ended.
 */
export async function TrialBanner({ churchId }: { churchId: string }) {
  const t = await getChurchTrial(churchId);
  if (!t.plan) return null;

  if (t.phase === "active") {
    return (
      <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-ink">
        <span className="flex items-center gap-2"><Clock className="size-4 shrink-0 text-primary" />
          {label(t.plan)} trial: {t.daysLeft} {t.daysLeft === 1 ? "day" : "days"} left. Upgrade to keep the {label(t.plan)} features.</span>
        <Link href="/app/settings?tab=billing" className="shrink-0 rounded-lg bg-surface px-3 py-1.5 text-xs font-semibold shadow-sm hover:bg-surface-2">Keep {label(t.plan)}</Link>
      </div>
    );
  }

  if (t.phase === "ended" && t.endsAt && Date.now() - new Date(t.endsAt).getTime() < NUDGE_DAYS * DAY) {
    return (
      <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
        <span className="flex items-center gap-2"><Sparkles className="size-4 shrink-0" />Your {label(t.plan)} trial has ended. Upgrade to switch the {label(t.plan)} features back on.</span>
        <Link href="/app/settings?tab=billing" className="shrink-0 rounded-lg bg-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-sm hover:bg-surface-2">Upgrade</Link>
      </div>
    );
  }
  return null;
}
