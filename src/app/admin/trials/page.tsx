import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { Pager } from "@/components/admin/pager";
import { paging, readPage } from "@/lib/admin-paging";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { getTrialOverview, type TrialFilter, type TrialSort } from "@/lib/data/admin-trials";
import { TrialsClient, type StepFeature } from "@/components/admin/trials-client";
import { PLAN_IDS, FEATURE_LABELS } from "@/lib/plan-gate";
import { TRIAL_STEPS, type TrialStep } from "@/lib/trial-settings";

export const metadata = { title: "Free trials" };
export const dynamic = "force-dynamic";

const FILTERS: TrialFilter[] = ["all", "eligible", "active", "ended", "converted"];

export default async function AdminTrialsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; filter?: string; sort?: string }> }) {
  const sa = await requireSuperAdmin();
  const sp = await searchParams;
  const filter = (FILTERS as string[]).includes(sp.filter ?? "") ? (sp.filter as TrialFilter) : "all";
  const q = (sp.q ?? "").slice(0, 80);
  const cfg = await getPlatformConfig();
  const sort = (["status", "members-desc", "members-asc", "name"] as string[]).includes(sp.sort ?? "") ? (sp.sort as TrialSort) : "status";
  const overview = await getTrialOverview(cfg.trials, filter, q, sort);
  const pg = paging(overview.total, readPage(sp.page));
  const rows = overview.rows.slice(pg.skip, pg.skip + pg.size);

  // What each trial step adds over the plan below it, so SuperAdmin can hold some of it back.
  const stepFeatures = Object.fromEntries(TRIAL_STEPS.map((step) => {
    const below = PLAN_IDS[PLAN_IDS.indexOf(step) - 1];
    const have = new Set(cfg.planTable[below]?.features ?? []);
    const added: StepFeature[] = (cfg.planTable[step]?.features ?? []).filter((f) => !have.has(f)).map((f) => ({ key: f, label: FEATURE_LABELS[f] ?? f }));
    return [step, added];
  })) as Record<TrialStep, StepFeature[]>;

  return (
    <AdminShell email={sa.email} isOwner={sa.role === "owner"}>
      <TrialsClient settings={cfg.trials} rows={rows} counts={overview.counts} conversionPct={overview.conversionPct} filter={filter} q={q} sort={sort} allIds={overview.allIds} stepFeatures={stepFeatures} />
      <Pager page={pg.page} pages={pg.pages} total={pg.total} size={pg.size} path="/admin/trials" params={{ q: q || undefined, filter: filter === "all" ? undefined : filter, sort: sort === "status" ? undefined : sort }} />
    </AdminShell>
  );
}
