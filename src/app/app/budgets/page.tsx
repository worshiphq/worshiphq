import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { BudgetsClient } from "@/components/app/budgets-client";
import { createBudget, addBudgetItem, addBudgetEntry, deleteBudgetEntry } from "@/app/actions/budgets";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Budgets" };

export default async function BudgetsPage() {
  const session = await requireModule("budgets");
  const isLeader = !!session.budgetDepartmentId;

  const [budgets, departments] = await Promise.all([
    db.budget.findMany({
      where: {
        churchId: session.churchId,
        ...(isLeader ? { departmentId: session.budgetDepartmentId } : {}),
      },
      orderBy: [{ year: "desc" }, { createdAt: "desc" }],
      include: {
        items: { orderBy: { category: "asc" } },
        entries: { orderBy: { date: "desc" } },
        department: { select: { name: true } },
      },
    }),
    isLeader ? Promise.resolve([]) : db.department.findMany({ where: { churchId: session.churchId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const currentYear = new Date().getFullYear();

  return (
    <div>
      <PageHeader
        title={isLeader ? `${session.budgetDepartmentName ?? "Department"} budget` : "Budget management"}
        description={
          isLeader
            ? "Record your ministry's income and expenses against your budget."
            : "Plan and track budgets by department, year or quarter."
        }
      >
        {!isLeader && (
          <ActionDialog
            triggerLabel="New budget"
            triggerIcon={<Plus />}
            title="Create budget"
            description="Set up a new annual or quarterly budget, optionally for a department."
            submitLabel="Create"
            action={createBudget}
            disabled={session.isDemo}
          >
            <Field label="Budget name" name="name" placeholder="e.g. 2026 Youth Ministry" required />
            <Field label="Department / ministry" name="departmentId" type="select" options={[
              { label: "Whole church (no department)", value: "" },
              ...departments.map((d) => ({ label: d.name, value: d.id })),
            ]} />
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
        )}
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
          department: b.department?.name ?? null,
          items: b.items.map((i) => ({
            id: i.id,
            category: i.category,
            description: i.description,
            amount: i.amount,
            spent: i.spent,
          })),
          entries: b.entries.map((e) => ({
            id: e.id,
            type: e.type as "income" | "expense",
            description: e.description,
            category: e.category,
            amount: e.amount,
            date: e.date.toISOString(),
          })),
        }))}
        isLeader={isLeader}
        addItemAction={addBudgetItem}
        addEntryAction={addBudgetEntry}
        deleteEntryAction={deleteBudgetEntry}
        isDemo={session.isDemo}
      />
    </div>
  );
}
