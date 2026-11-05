import "server-only";
import { db } from "@/lib/db";
import { paidPlan } from "@/lib/plan-gate";
import { trialInfo, type TrialPhase, type TrialSettings, type TrialStep } from "@/lib/trial-settings";

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
      id: true, name: true,
      subscription: { select: { plan: true, status: true, renewsAt: true, trialPlan: true, trialStartedAt: true, trialEndsAt: true, trialsUsed: true } },
    },
    orderBy: { name: "asc" },
  });
  const counts_ = await db.person.groupBy({ by: ["churchId"], where: { status: { not: "visitor" } }, _count: { _all: true } });
  const memberOf = new Map(counts_.map((c) => [c.churchId, c._count._all]));
  const now = new Date();
  const all: TrialRow[] = churches.map((c) => {
    const paid = paidPlan(c.subscription, now);
    const info = trialInfo(c.subscription, paid, settings, now);
    return {
      churchId: c.id, name: c.name, paidPlan: paid, phase: info.phase, trialPlan: info.plan,
      endsAt: info.endsAt, daysLeft: info.daysLeft, canStart: info.canStart, blockedReason: info.blockedReason,
      used: c.subscription?.trialsUsed ?? [],
      members: memberOf.get(c.id) ?? 0,
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
