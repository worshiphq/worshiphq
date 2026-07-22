import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
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

  const assets = await db.asset.findMany({
    where: { churchId: session.churchId },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const totalValue = assets.reduce((s, a) => s + (a.purchasePrice ?? 0), 0);

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
          disabled={session.isDemo}
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
        assets={assets.map((a) => ({
          id: a.id,
          name: a.name,
          category: a.category,
          condition: a.condition,
          location: a.location,
          serialNo: a.serialNo,
          purchasePrice: a.purchasePrice,
          purchaseDate: a.purchaseDate?.toISOString() ?? null,
          notes: a.notes,
        }))}
        totalValue={totalValue}
        totalCount={assets.length}
      />
    </div>
  );
}
