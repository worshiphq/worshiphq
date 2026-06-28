"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";

export async function reorderLeaders(orderedIds: string[]) {
  const session = await requireSession();
  assertCanWrite(session);

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
  assertCanWrite(session);

  const clamped = Math.max(1, Math.min(50, count));
  await db.church.update({
    where: { id: session.churchId },
    data: { featuredLeaderCount: clamped },
  });
  revalidatePath("/app");
  revalidatePath("/app/leaders");
}
