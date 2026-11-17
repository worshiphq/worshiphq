import Link from "@/components/ui/app-link";
import { Lock, Users } from "lucide-react";
import { getMemberLock } from "@/lib/member-lock";
import { lockedBannerText } from "@/lib/member-lock-core";

/**
 * For the Main Admin and admins of a church over its plan's member limit. The newest people past the limit are
 * locked (see src/lib/member-lock.ts): still listed, but left out of messages and check-in until the church renews,
 * upgrades or removes people. Visitors are never locked, so the door stays open on a Sunday.
 */
export async function OverLimitBanner({ churchId }: { churchId: string }) {
  // Cached for a minute per church, and shared with every other lock check, so this costs nothing on most pages.
  const lock = await getMemberLock(churchId);
  if (lock.limit === null || lock.used <= lock.limit) return null;
  const locked = lock.locked.size;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      {locked > 0
        ? <Lock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        : <Users className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />}
      <span className="flex-1 text-ink">
        {locked > 0 ? (
          <>
            {lockedBannerText(locked, lock.limit)}{" "}
            <Link href="/app/people" className="font-medium underline-offset-2 hover:underline">See who is locked</Link>
          </>
        ) : (
          <>
            Your church has <b>{lock.used.toLocaleString()}</b> people and your plan includes {lock.limit.toLocaleString()}. New visitors are still welcomed,
            but you can&rsquo;t add more members until you upgrade or remove people you no longer need.
          </>
        )}
      </span>
      <Link href="/app/settings?tab=billing" className="font-semibold text-amber-700 hover:underline dark:text-amber-300">Upgrade</Link>
    </div>
  );
}
