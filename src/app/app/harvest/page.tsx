import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { getHarvestData } from "@/lib/data/harvest";
import { HarvestClient } from "@/components/app/harvest-client";

export const metadata = { title: "Harvest" };

export default async function HarvestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireModule("harvest");
  const params = await searchParams;
  const year = Number(params.year) || new Date().getFullYear();

  const [data, church, harvestPledges] = await Promise.all([
    getHarvestData(session.churchId, year),
    db.church.findUnique({
      where: { id: session.churchId },
      select: { harvestReceiptTemplate: true },
    }),
    // Pledges is the single engine — Harvest just reads the ones tagged to it.
    db.pledge.findMany({
      where: { churchId: session.churchId, harvest: { year } },
      select: { id: true, donorName: true, amount: true, fulfilled: true, dueAt: true },
      orderBy: [{ dueAt: "asc" }, { donorName: "asc" }],
    }),
  ]);

  const pledgedTotal = harvestPledges.reduce((s, p) => s + Number(p.amount), 0);
  const pledgePaid = harvestPledges.reduce((s, p) => s + Number(p.fulfilled), 0);

  return (
    <div>
      <PageHeader title="Harvest" description="Annual harvest contributions, records and reports." />
      <HarvestClient
        {...data}
        year={year}
        canWrite={!session.isDemo}
        harvestTemplate={church?.harvestReceiptTemplate ?? null}
      />

      {harvestPledges.length > 0 && (
        <div className="mt-6 rounded-2xl border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
            <div>
              <h2 className="font-display text-base font-semibold">Pledges toward {year} harvest</h2>
              <p className="text-xs text-ink-muted">
                {harvestPledges.length} pledge{harvestPledges.length !== 1 ? "s" : ""} ·
                {" "}₵{pledgePaid.toLocaleString()} received of ₵{pledgedTotal.toLocaleString()} pledged
              </p>
            </div>
            <Link href="/app/pledges" className="text-sm font-semibold text-primary hover:underline">
              Manage in Pledges →
            </Link>
          </div>
          <div className="divide-y divide-line-soft">
            {harvestPledges.map((p) => {
              const paid = Number(p.fulfilled);
              const total = Number(p.amount);
              const done = paid >= total;
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="font-medium">{p.donorName}</span>
                  <span className="flex items-center gap-3 text-xs">
                    <span className={done ? "text-success" : "text-ink-muted"}>
                      ₵{paid.toLocaleString()} / ₵{total.toLocaleString()}
                    </span>
                    {p.dueAt && (
                      <span className="text-ink-faint">
                        due {p.dueAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
