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

  const [data, church] = await Promise.all([
    getHarvestData(session.churchId, year),
    db.church.findUnique({
      where: { id: session.churchId },
      select: { harvestReceiptTemplate: true },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Harvest" description="Annual harvest contributions, records and reports." />
      <HarvestClient
        {...data}
        year={year}
        canWrite={!session.isDemo}
        harvestTemplate={church?.harvestReceiptTemplate ?? null}
      />
    </div>
  );
}
