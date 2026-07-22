import { requireModule } from "@/lib/auth";
import { hasSection } from "@/lib/permissions";
import { getChurchPlan } from "@/lib/plan-gate-server";
import { planRank } from "@/lib/plan-gate";
import { allowedDatasets } from "@/lib/export/datasets";
import { PageHeader } from "@/components/app/page-header";
import { ExportClient } from "@/components/app/export-client";

export const metadata = { title: "Download data" };

export default async function ExportPage() {
  const session = await requireModule("export");
  const plan = await getChurchPlan(session.churchId);
  const canBundle = planRank(plan) >= planRank("pro");

  const datasets = allowedDatasets((key) => hasSection(session, key)).map((d) => ({
    key: d.key,
    label: d.label,
  }));

  return (
    <div>
      <PageHeader
        title="Download data"
        description="Export your church's records — a single tab, or everything at once."
      />
      <ExportClient datasets={datasets} canBundle={canBundle} plan={plan} />
    </div>
  );
}
