import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { queryAssets, assetSummary } from "@/lib/data/assets";
import { ctxFrom } from "@/lib/expenses/post";
import { AssetsClient } from "@/components/app/assets-client";

export const metadata = { title: "Assets" };

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireModule("assets");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const canWrite = canEdit(session, "assets");
  const ctx = ctxFrom(session);

  const [first, summary, departments, accounts] = await Promise.all([
    queryAssets(session.churchId, q, {}, 1),
    assetSummary(session.churchId),
    canWrite ? db.department.findMany({ where: { churchId: session.churchId }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    canWrite && ctx.canPostExpenses ? db.churchAccount.findMany({ where: { churchId: session.churchId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }], select: { id: true, name: true, isDefault: true } }) : Promise.resolve([]),
  ]);

  return (
    <AssetsClient
      initial={first}
      initialQuery={q}
      summary={{
        book: summary.book, cost: summary.cost, held: summary.held, byStatus: summary.byStatus, lateCount: summary.lateCount,
        attention: summary.attention, categories: summary.categories, places: summary.places, custodians: summary.custodians,
      }}
      lists={{ facilities: summary.facilities, departments, accounts }}
      canWrite={canWrite}
      canPostExpenses={ctx.canPostExpenses}
    />
  );
}
