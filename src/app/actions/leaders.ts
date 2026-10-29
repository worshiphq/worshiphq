"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { cleanLeaderTitle, cleanLeaderTitles, DEFAULT_LEADER_TITLES } from "@/lib/leader-titles";

export async function reorderLeaders(orderedIds: string[]) {
  const session = await requireSession();
  assertCanWrite(session, "leaders");

  await Promise.all(
    orderedIds.map((id, i) =>
      db.person.updateMany({
        where: { id, churchId: session.churchId },
        data: { leaderSortOrder: i },
      }),
    ),
  );
  revalidatePath("/app");
  revalidatePath("/app/leaders");
}

export async function updateFeaturedLeaderCount(count: number) {
  const session = await requireSession();
  assertCanWrite(session, "leaders");

  const clamped = Math.max(1, Math.min(50, count));
  await db.church.update({
    where: { id: session.churchId },
    data: { featuredLeaderCount: clamped },
  });
  revalidatePath("/app");
  revalidatePath("/app/leaders");
}

/**
 * Save the church's own leadership titles, in order. `renames` carries any title whose wording was changed, so the people
 * who have it keep it under the new wording. A title taken off the list stays on the people who already have it.
 */
export async function saveLeaderTitles(input: { titles: string[]; renames?: { from: string; to: string }[] }): Promise<{ ok: true; titles: string[] } | { ok: false; error: string }> {
  const session = await requireSession();
  assertCanWrite(session, "leaders");
  if (session.isDemo) return { ok: false, error: "This is the read-only demo." };

  const titles = cleanLeaderTitles(input.titles);
  if (!titles.length) return { ok: false, error: "Keep at least one title, or use Reset to go back to the standard list." };

  for (const r of input.renames ?? []) {
    const from = cleanLeaderTitle(r.from);
    const to = cleanLeaderTitle(r.to);
    if (!from || !to || from === to) continue;
    await db.person.updateMany({ where: { churchId: session.churchId, leaderTitle: from }, data: { leaderTitle: to } });
  }
  await db.church.update({ where: { id: session.churchId }, data: { leaderTitles: titles } });
  revalidatePath("/app");
  revalidatePath("/app/leaders");
  revalidatePath("/app/people");
  return { ok: true, titles };
}

/** Back to the standard list. */
export async function resetLeaderTitles(): Promise<{ ok: true; titles: string[] } | { ok: false; error: string }> {
  const session = await requireSession();
  assertCanWrite(session, "leaders");
  if (session.isDemo) return { ok: false, error: "This is the read-only demo." };
  await db.church.update({ where: { id: session.churchId }, data: { leaderTitles: [] } });
  revalidatePath("/app/leaders");
  revalidatePath("/app/people");
  return { ok: true, titles: [...DEFAULT_LEADER_TITLES] };
}
