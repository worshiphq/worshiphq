import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { ExpensesClient } from "@/components/app/expenses-client";
import { createExpense } from "@/app/actions/expenses";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Expenses" };

const CATEGORIES = ["general", "utilities", "rent", "transport", "maintenance", "supplies", "salaries", "missions", "welfare", "events", "other"];

export default async function ExpensesPage() {
  const session = await requireModule("expenses");

  const expenses = await db.expense.findMany({
    where: { churchId: session.churchId },
    orderBy: { date: "desc" },
    take: 300,
  });

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Track church expenditures and outgoing payments."
      >
        <ActionDialog
          triggerLabel="Record expense"
          triggerIcon={<Plus />}
          title="Record expense"
          description="Log a church expense or payment."
          submitLabel="Record"
          action={createExpense}
          disabled={session.isDemo}
        >
          <Field label="Description" name="description" placeholder="What was purchased or paid for" required />
          <Field label="Amount (GHS)" name="amount" type="number" placeholder="0" required />
          <Field label="Category" name="category" options={CATEGORIES} />
          <Field label="Vendor / payee" name="vendor" placeholder="Who was paid" />
          <Field label="Receipt reference" name="receiptRef" placeholder="Receipt or invoice number" />
          <Field label="Approved by" name="approvedBy" placeholder="Name of approving officer" />
          <Field label="Date" name="date" type="date" />
        </ActionDialog>
      </PageHeader>

      <ExpensesClient
        expenses={expenses.map((e) => ({
          id: e.id,
          description: e.description,
          category: e.category,
          amount: e.amount,
          vendor: e.vendor,
          receiptRef: e.receiptRef,
          approvedBy: e.approvedBy,
          date: e.date.toISOString(),
        }))}
        totalAmount={totalAmount}
        totalCount={expenses.length}
      />
    </div>
  );
}
