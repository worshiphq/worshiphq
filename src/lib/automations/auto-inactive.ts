import "server-only";
import { db } from "@/lib/db";
import { onlyWithFeature } from "@/lib/plan-gate-batch";
import { forEachChurch, type Deadline } from "@/lib/automations/pool";
import { absentMembers, type AbsentMember } from "@/lib/automations/absence";
import { notifyChurchAdmins } from "@/lib/notify/admins";

/**
 * Max: move members who have stopped coming to "inactive" on their own.
 *
 * "Away" is the same idea the we-miss-you texts already use (absentMembers): someone with a check-in on
 * record who has not been seen for the church's chosen number of weeks. Someone who never attended is not
 * counted, because silence about them proves nothing.
 *
 * Two protections, because flipping people's status wrongly is worse than not flipping it:
 *
 *  - NOT TRACKING. If nobody at all has been checked in for three weeks, the church has most likely stopped
 *    taking attendance (or is between seasons). That is not evidence that every member left, so nothing moves.
 *  - NOT A MASS CHANGE. If a run would move more than 40% of the active members (and more than five people)
 *    it is held back instead of applied. A real church does not lose that share in one night; a broken
 *    attendance feed does.
 *
 * Nothing is deleted and nothing is lost: an inactive member keeps their record and history, and an admin
 * can set them back to active from People at any time.
 */

export const AUTO_INACTIVE_MIN_WEEKS = 4;
export const AUTO_INACTIVE_MAX_WEEKS = 104;
const TRACKING_WINDOW_DAYS = 21;
const MASS_CHANGE_RATIO = 0.4;
const MASS_CHANGE_FLOOR = 5;

export const clampWeeks = (w: number) => Math.min(AUTO_INACTIVE_MAX_WEEKS, Math.max(AUTO_INACTIVE_MIN_WEEKS, Math.trunc(w) || AUTO_INACTIVE_MIN_WEEKS));

export type AutoInactivePlan =
  | { ok: true; members: AbsentMember[] }
  | { ok: false; reason: "not_tracking" | "mass_change"; members: AbsentMember[]; active: number };

/** Who would be moved to inactive right now for this church and threshold. Writes nothing. */
export async function planAutoInactive(churchId: string, weeks: number, timezone: string, now = new Date()): Promise<AutoInactivePlan> {
  const w = clampWeeks(weeks);
  const since = new Date(now.getTime() - TRACKING_WINDOW_DAYS * 86_400_000);
  const recentCheckIns = await db.attendanceRecord.count({ where: { churchId, date: { gte: since } } });
  if (recentCheckIns === 0) return { ok: false, reason: "not_tracking", members: [], active: 0 };

  const members = await absentMembers(churchId, w, timezone, now);
  if (members.length === 0) return { ok: true, members };

  const active = await db.person.count({ where: { churchId, status: "active" } });
  if (members.length > MASS_CHANGE_FLOOR && members.length > active * MASS_CHANGE_RATIO) {
    return { ok: false, reason: "mass_change", members, active };
  }
  return { ok: true, members };
}

export async function runAutoInactive(now = new Date(), deadline?: Deadline) {
  const churches = await onlyWithFeature(
    await db.church.findMany({
      where: { isDemo: false, autoInactiveOn: true },
      select: { id: true, name: true, timezone: true, autoInactiveWeeks: true },
    }),
    "auto-inactive",
  );

  let moved = 0;
  let held = 0;
  const pool = await forEachChurch(churches, async (church) => {
    const plan = await planAutoInactive(church.id, church.autoInactiveWeeks, church.timezone, now);
    if (!plan.ok) {
      if (plan.reason === "mass_change") {
        held++;
        console.warn(`[auto-inactive] ${church.name}: held back ${plan.members.length} of ${plan.active} active members (more than ${MASS_CHANGE_RATIO * 100}%)`);
      }
      return;
    }
    if (plan.members.length === 0) return;

    const ids = plan.members.map((m) => m.id);
    const res = await db.person.updateMany({ where: { id: { in: ids }, churchId: church.id, status: "active" }, data: { status: "inactive" } });
    moved += res.count;

    const weeks = clampWeeks(church.autoInactiveWeeks);
    const names = plan.members.slice(0, 8).map((m) => m.name).join(", ");
    await notifyChurchAdmins(church.id, {
      subject: "Members marked inactive",
      sms: `${res.count} member${res.count === 1 ? "" : "s"} not seen for ${weeks}+ weeks ${res.count === 1 ? "was" : "were"} marked inactive: ${names}${plan.members.length > 8 ? " and more" : ""}. Set anyone back to active in People.`,
      force: true,
    });
  }, { deadline, label: "auto-inactive" });

  return { churches: churches.length, moved, held, ...pool };
}
