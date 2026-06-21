"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search, Receipt, Trash2, Calendar, Store, FileText, UserCheck, Banknote,
} from "lucide-react";
import { deleteExpense } from "@/app/actions/expenses";

type ExpenseRow = {
  id: string;
  description: string;
  category: string;
  amount: number;
  vendor: string | null;
  receiptRef: string | null;
  approvedBy: string | null;
  date: string;
};

function formatGHS(n: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(n);
}

export function ExpensesClient({
  expenses,
  totalAmount,
  totalCount,
}: {
  expenses: ExpenseRow[];
  totalAmount: number;
  totalCount: number;
}) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [pending, start] = useTransition();

  const categories = [...new Set(expenses.map((e) => e.category))].sort();

  const filtered = expenses.filter((e) => {
    if (catFilter && e.category !== catFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return e.description.toLowerCase().includes(q) || e.vendor?.toLowerCase().includes(q);
  });

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => deleteExpense(fd));
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-3 p-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand/10">
            <Receipt className="size-5 text-brand" />
          </div>
          <div>
            <p className="text-2xl font-bold">{totalCount}</p>
            <p className="text-xs text-ink-muted">Expense records</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-danger/10">
            <Banknote className="size-5 text-danger" />
          </div>
          <div>
            <p className="text-2xl font-bold">{formatGHS(totalAmount)}</p>
            <p className="text-xs text-ink-muted">Total spent</p>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            placeholder="Search expenses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="h-11 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Receipt className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {search || catFilter ? "No expenses match your filter." : "No expenses recorded yet. Start tracking church expenditures."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <Card key={e.id} className={`p-4 ${pending ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-danger/10">
                  <Receipt className="size-4 text-danger" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{e.description}</span>
                    <Badge variant="default" className="text-[10px]">{e.category}</Badge>
                    <span className="text-sm font-bold text-danger">{formatGHS(e.amount)}</span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-ink-faint">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    {e.vendor && (
                      <span className="flex items-center gap-1">
                        <Store className="size-3" /> {e.vendor}
                      </span>
                    )}
                    {e.receiptRef && (
                      <span className="flex items-center gap-1">
                        <FileText className="size-3" /> {e.receiptRef}
                      </span>
                    )}
                    {e.approvedBy && (
                      <span className="flex items-center gap-1">
                        <UserCheck className="size-3" /> {e.approvedBy}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(e.id)}
                  className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
                  title="Delete"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
