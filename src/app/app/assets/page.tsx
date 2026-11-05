import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { queryAssets, assetTotals } from "@/lib/data/lists-b";
import { AssetsClient } from "@/components/app/assets-client";
import { createAsset } from "@/app/actions/assets";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Assets" };

const CATEGORIES = ["general", "audio-visual", "musical", "furniture", "vehicle", "IT", "kitchen", "other"];
const CONDITIONS = ["new", "good", "fair", "poor", "decommissioned"];

export default async function AssetsPage() {
  const session = await requireModule("assets");

  const [first, totals] = await Promise.all([queryAssets(session.churchId, "", "", 1), assetTotals(session.churchId)]);

  return (
    <div>
      <PageHeader
        title="Assets & equipment"
        description="Track church property, instruments, and equipment."
      >
        <ActionDialog
          triggerLabel="Add asset"
          triggerIcon={<Plus />}
          title="Add asset"
          description="Register a piece of church equipment or property."
          submitLabel="Save"
          action={createAsset}
          disabled={!canEdit(session, "assets")}
        >
          <Field label="Name" name="name" placeholder="e.g. Yamaha keyboard" required />
          <Field label="Category" name="category" options={CATEGORIES} />
          <Field label="Condition" name="condition" options={CONDITIONS} />
          <Field label="Location" name="location" placeholder="e.g. Main hall" />
          <Field label="Serial number" name="serialNo" placeholder="Optional" />
          <Field label="Purchase date" name="purchaseDate" type="date" />
          <Field label="Purchase price (GHS)" name="purchasePrice" type="number" placeholder="0" />
          <Field label="Notes" name="notes" placeholder="Additional details..." />
        </ActionDialog>
      </PageHeader>

      <AssetsClient
        initial={first}
        totalValue={totals.totalValue}
        totalCount={totals.totalCount}
        categories={totals.categories}
      />
    </div>
  );
}
