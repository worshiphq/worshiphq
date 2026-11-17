import { requireModule } from "@/lib/auth";
import { levyAccess } from "@/lib/levies/guards";
import { getLeviesPage } from "@/lib/data/levies";
import { LeviesClient, type LevyTab } from "@/components/app/levies/levies-client";
import { ymdInTz } from "@/lib/time/tz";

export const metadata = { title: "Levies" };

const TABS: LevyTab[] = ["overview", "records", "rules", "branches", "settings"];

export default async function LeviesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireModule("levies");
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const thisYear = Number(ymdInTz(new Date(), "Africa/Accra").slice(0, 4));
  const y = parseInt(one(params.y), 10);
  const year = Number.isFinite(y) && y > 2000 && y <= thisYear + 1 ? y : thisYear;
  const tab = (TABS as string[]).includes(one(params.tab)) ? (one(params.tab) as LevyTab) : "overview";
  const a = levyAccess(session);
  // Demo visitors see the page but nothing is recalculated or written for them.
  const data = await getLeviesPage(session.churchId, year, { manage: a.manage, del: a.del, reopen: a.reopen, branchLocked: a.branchLocked }, { sync: !session.isDemo });
  return <LeviesClient data={data} initialTab={tab} canPublishSchedule={a.manage && !a.branchLocked && (session.role === "Owner" || session.role === "Admin")} />;
}
