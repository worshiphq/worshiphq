import "server-only";
import { db } from "@/lib/db";
import { paidPlan } from "@/lib/plan-gate";
import { trialInfo, trialOffered, type TrialPhase, type TrialSettings, type TrialStep } from "@/lib/trial-settings";

export type TrialFilter = "all" | "eligible" | "active" | "ended" | "converted";

export interface TrialRow {
  churchId: string;
  name: string;
  paidPlan: string;
  phase: TrialPhase;
  trialPlan: TrialStep | null;
  endsAt: string | null;
  daysLeft: number;
  /** The plan this church could try right now, or null. */
  canStart: TrialStep | null;
  blockedReason: string | null;
  used: string[];
  /** People on the church's list, visitors left out (the number its plan limit counts). */
  members: number;
  /** Invited by SuperAdmin. */
  invited: boolean;
  /** Passes the automatic rule (enough members, long enough on the site). */
  auto: boolean;
  /** Is shown the Start button right now (invited or auto), when a trial is available at all. */
  offered: boolean;
  /** Free month of Communications: none, running (days left) or ended. */
  comms: { phase: "none" | "active" | "ended"; daysLeft: number; endsAt: string | null };
}

export interface TrialOverview {
  rows: TrialRow[];
  /** Every church id matching the filter and search, so "select all" works across pages. */
  allIds: string[];
  total: number;
  counts: Record<TrialFilter, number>;
  /** Of the churches whose trial is over: the share that upgraded to the plan they tried. */
  conversionPct: number | null;
}

/** Every church's trial standing, filtered and searched, newest trial activity first. Paged by the caller. */
export type TrialSort = "status" | "members-desc" | "members-asc" | "name";

export async function getTrialOverview(settings: TrialSettings, filter: TrialFilter, q: string, sort: TrialSort = "status"): Promise<TrialOverview> {
  const churches = await db.church.findMany({
    where: { isDemo: false },
    select: {
      id: true, name: true, createdAt: true,
      subscription: { select: { plan: true, status: true, renewsAt: true, trialPlan: true, trialStartedAt: true, trialEndsAt: true, trialsUsed: true, trialInvitedAt: true, commsTrialEndsAt: true } },
    },
    orderBy: { name: "asc" },
  });
  const counts_ = await db.person.groupBy({ by: ["churchId"], where: { status: { not: "visitor" } }, _count: { _all: true } });
  const memberOf = new Map(counts_.map((c) => [c.churchId, c._count._all]));
  const now = new Date();
  const all: TrialRow[] = churches.map((c) => {
    const paid = paidPlan(c.subscription, now);
    const info = trialInfo(c.subscription, paid, settings, now);
    const members = memberOf.get(c.id) ?? 0;
    const ageDays = Math.floor((now.getTime() - c.createdAt.getTime()) / 86_400_000);
    const access = { invited: !!c.subscription?.trialInvitedAt, members, ageDays };
    const ends = c.subscription?.commsTrialEndsAt ?? null;
    const commsLeft = ends ? Math.ceil((ends.getTime() - now.getTime()) / 86_400_000) : 0;
    return {
      churchId: c.id, name: c.name, paidPlan: paid, phase: info.phase, trialPlan: info.plan,
      endsAt: info.endsAt, daysLeft: info.daysLeft, canStart: info.canStart, blockedReason: info.blockedReason,
      used: c.subscription?.trialsUsed ?? [],
      members,
      invited: access.invited,
      auto: settings.auto.enabled && members >= settings.auto.minMembers && ageDays >= settings.auto.minDays,
      offered: !!info.canStart && trialOffered(access, settings),
      comms: { phase: !ends ? "none" : commsLeft > 0 ? "active" : "ended", daysLeft: Math.max(0, commsLeft), endsAt: ends?.toISOString() ?? null },
    };
  });

  const counts: Record<TrialFilter, number> = {
    all: all.length,
    eligible: all.filter((r) => r.canStart).length,
    active: all.filter((r) => r.phase === "active").length,
    ended: all.filter((r) => r.phase === "ended").length,
    converted: all.filter((r) => r.phase === "converted").length,
  };
  const over = counts.ended + counts.converted;

  const needle = q.trim().toLowerCase();
  const match = (r: TrialRow) => {
    if (needle && !r.name.toLowerCase().includes(needle)) return false;
    if (filter === "eligible") return !!r.canStart;
    if (filter === "active" || filter === "ended" || filter === "converted") return r.phase === filter;
    return true;
  };
  const byStatus = (a: TrialRow, b: TrialRow) => {
    // Running trials first (soonest to end), then the rest by when their trial ended, then everyone else by name.
    const rank = (r: TrialRow) => (r.phase === "active" ? 0 : r.phase === "ended" ? 1 : r.phase === "converted" ? 2 : 3);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.endsAt && b.endsAt) return a.phase === "active" ? a.endsAt.localeCompare(b.endsAt) : b.endsAt.localeCompare(a.endsAt);
    return a.name.localeCompare(b.name);
  };
  const rows = all.filter(match).sort(
    sort === "members-desc" ? (a, b) => b.members - a.members || a.name.localeCompare(b.name)
      : sort === "members-asc" ? (a, b) => a.members - b.members || a.name.localeCompare(b.name)
        : sort === "name" ? (a, b) => a.name.localeCompare(b.name)
          : byStatus,
  );
  return { rows, allIds: rows.map((r) => r.churchId), total: rows.length, counts, conversionPct: over > 0 ? Math.round((counts.converted / over) * 100) : null };
}
