import "server-only";
import { db } from "@/lib/db";

/**
 * Is this facility already booked (confirmed) at any point between start and end?
 * Back-to-back bookings (one ends exactly when the next begins) are fine.
 * `excludeId` skips the booking being edited.
 */
export async function findBookingConflict(
  churchId: string,
  facilityId: string,
  start: Date,
  end: Date,
  excludeId?: string,
): Promise<{ title: string; when: string } | null> {
  const clash = await db.booking.findFirst({
    where: {
      churchId,
      facilityId,
      status: "confirmed",
      startTime: { lt: end },
      endTime: { gt: start },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { title: true, startTime: true, endTime: true },
    orderBy: { startTime: "asc" },
  });
  if (!clash) return null;
  const fmt = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return { title: clash.title, when: `${fmt(clash.startTime)} to ${fmt(clash.endTime)}` };
}
