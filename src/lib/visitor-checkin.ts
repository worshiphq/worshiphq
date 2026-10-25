import "server-only";
import { db } from "@/lib/db";

/**
 * Count a check-in toward a visitor's visits (three or more makes them a regular).
 * Lives outside the "use server" files so it can't be called from a browser.
 */
export async function recordVisitorCheckin(personId: string, churchId: string) {
  const visitor = await db.visitor.findFirst({ where: { personId, churchId } });
  if (!visitor) return;
  const count = visitor.visitCount + 1;
  await db.visitor.update({
    where: { id: visitor.id },
    data: {
      visitCount: count,
      lastVisit: new Date(),
      isRegular: count >= 3 ? true : visitor.isRegular,
    },
  });
}
