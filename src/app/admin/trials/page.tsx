import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { Pager } from "@/components/admin/pager";
import { paging, readPage } from "@/lib/admin-paging";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { getTrialOverview, type TrialFilter } from "@/lib/data/admin-trials";
import { TrialsClient } from "@/components/admin/trials-client";

export const metadata = { title: "Free trials" };
export const dynamic = "force-dynamic";

const FILTERS: TrialFilter[] = ["all", "eligible", "active", "ended", "converted"];

export default async function AdminTrialsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; filter?: string }> }) {
  const sa = await requireSuperAdmin();
  const sp = await searchParams;
  const filter = (FILTERS as string[]).includes(sp.filter ?? "") ? (sp.filter as TrialFilter) : "all";
  const q = (sp.q ?? "").slice(0, 80);
  const cfg = await getPlatformConfig();
  const overview = await getTrialOverview(cfg.trials, filter, q);
  const pg = paging(overview.total, readPage(sp.page));
  const rows = overview.rows.slice(pg.skip, pg.skip + pg.size);

  return (
    <AdminShell email={sa.email} isOwner={sa.role === "owner"}>
      <TrialsClient settings={cfg.trials} rows={rows} counts={overview.counts} conversionPct={overview.conversionPct} filter={filter} q={q} />
      <Pager page={pg.page} pages={pg.pages} total={pg.total} size={pg.size} path="/admin/trials" params={{ q: q || undefined, filter: filter === "all" ? undefined : filter }} />
    </AdminShell>
  );
}
