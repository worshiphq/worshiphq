import "server-only";
import { db } from "@/lib/db";
import { ttlCached } from "@/lib/ttl-cache";

/**
 * Is this the hidden internal QA church? Cached for a few minutes: the flag is set once when the QA church is made
 * and never changes for a real church, so a slightly stale answer is harmless. Unknown ids count as not internal.
 */
export async function isInternalChurchId(churchId: string | null | undefined): Promise<boolean> {
  if (!churchId) return false;
  return ttlCached(`church:internal:${churchId}`, 5 * 60_000, async () => {
    const c = await db.church.findUnique({ where: { id: churchId }, select: { isInternal: true } });
    return !!c?.isInternal;
  });
}
