import Link from "@/components/ui/app-link";
import { Users } from "lucide-react";
import { ttlCached } from "@/lib/ttl-cache";

/**
 * For the Main Admin of a church over its plan's member limit. On Free, visitors count towards the limit, but the
 * visitor form, QR check-in for newcomers and visitor imports never turn a real person away: a visitor at the door
 * on a Sunday matters more than the cap. Instead the Main Admin is told, plainly and on every screen, until they
 * upgrade or tidy up. Adding MEMBERS is still blocked at the limit as before.
 */
export async function OverLimitBanner({ churchId }: { churchId: string }) {
  // Counting everyone on every page would be wasted work: a few minutes old is fine for a banner.
  const room = await ttlCached(`over-limit:${churchId}`, 5 * 60_000, async () => {
    const { memberRoom } = await import("@/lib/member-limit");
    return memberRoom(churchId);
  });
  if (room.limit === null || room.used <= room.limit) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <Users className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="flex-1 text-ink">
        Your church has <b>{room.used.toLocaleString()}</b> people and your plan includes {room.limit.toLocaleString()}. New visitors are still welcomed,
        but you can&rsquo;t add more members until you upgrade or remove people you no longer need.
      </span>
      <Link href="/app/settings?tab=billing" className="font-semibold text-amber-700 hover:underline dark:text-amber-300">Upgrade</Link>
    </div>
  );
}
