import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { BudgetsClient } from "@/components/app/budgets-client";
import { createBudget, addBudgetItem } from "@/app/actions/budgets";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Budgets" };

export default async function BudgetsPage() {
  const session = await requireModule("budgets");

  const budgets = await db.budget.findMany({
    where: { churchId: session.churchId },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
    include: { items: { orderBy: { category: "asc" } } },
  });

  const currentYear = new Date().getFullYear();

  return (
    <div>
      <PageHeader
        title="Budget management"
        description="Plan and track church budgets by year or quarter."
      >
        <ActionDialog
          triggerLabel="New budget"
          triggerIcon={<Plus />}
          title="Create budget"
          description="Set up a new annual or quarterly budget."
          submitLabel="Create"
          action={createBudget}
          disabled={session.isDemo}
        >
          <Field label="Budget name" name="name" placeholder="e.g. 2026 Annual Budget" required />
          <Field label="Year" name="year" type="number" placeholder={String(currentYear)} required />
          <Field label="Quarter (optional)" name="quarter" type="select" options={[
            { label: "Annual (full year)", value: "" },
            { label: "Q1 (Jan–Mar)", value: "1" },
            { label: "Q2 (Apr–Jun)", value: "2" },
            { label: "Q3 (Jul–Sep)", value: "3" },
            { label: "Q4 (Oct–Dec)", value: "4" },
          ]} />
          <Field label="Notes" name="notes" type="textarea" placeholder="Budget notes..." />
        </ActionDialog>
      </PageHeader>

      <BudgetsClient
        budgets={budgets.map((b) => ({
          id: b.id,
          name: b.name,
          year: b.year,
          quarter: b.quarter,
          status: b.status,
          total: b.total,
          notes: b.notes,
          items: b.items.map((i) => ({
            id: i.id,
            category: i.category,
            description: i.description,
            amount: i.amount,
            spent: i.spent,
          })),
        }))}
        addItemAction={addBudgetItem}
        isDemo={session.isDemo}
      />
    </div>
  );
}
