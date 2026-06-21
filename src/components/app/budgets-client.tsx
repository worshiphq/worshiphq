"use client";

import { useState, useTransition } from "react";
import { Trash2, ChevronDown, ChevronRight, Plus, DollarSign, TrendingUp, AlertTriangle } from "lucide-react";
import { deleteBudget, deleteBudgetItem } from "@/app/actions/budgets";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

interface BudgetItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  spent: number;
}
interface Budget {
  id: string;
  name: string;
  year: number;
  quarter: number | null;
  status: string;
  total: number;
  notes: string | null;
  items: BudgetItem[];
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-ink-faint/10 text-ink-faint",
  approved: "bg-brand/10 text-brand",
  active: "bg-success/10 text-success",
  closed: "bg-ink-muted/10 text-ink-muted",
};

const fmt = (n: number) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(n);

export function BudgetsClient({
  budgets,
  addItemAction,
  isDemo,
}: {
  budgets: Budget[];
  addItemAction: (fd: FormData) => Promise<void>;
  isDemo: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();
  const { toast } = useFeedback();

  const totalBudget = budgets.reduce((s, b) => s + b.total, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.items.reduce((ss, i) => ss + i.spent, 0), 0);

  function toggle(id: string) {
    setExpanded((p) => ({ ...p, [id]: !p[id] }));
  }

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface p-3 text-center">
          <div className="text-2xl font-bold">{budgets.length}</div>
          <div className="text-xs text-ink-muted">Budgets</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3 text-center">
          <div className="text-2xl font-bold text-brand">{fmt(totalBudget)}</div>
          <div className="text-xs text-ink-muted">Total budgeted</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3 text-center">
          <div className={cn("text-2xl font-bold", totalSpent > totalBudget ? "text-danger" : "text-success")}>{fmt(totalSpent)}</div>
          <div className="text-xs text-ink-muted">Total spent</div>
        </div>
      </div>

      {budgets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink-faint">
          No budgets created yet. Use the button above to start a budget.
        </div>
      ) : (
        <div className="grid gap-3">
          {budgets.map((b) => {
            const open = expanded[b.id] ?? false;
            const spent = b.items.reduce((s, i) => s + i.spent, 0);
            const pct = b.total > 0 ? Math.min(100, Math.round((spent / b.total) * 100)) : 0;
            return (
              <div key={b.id} className="rounded-2xl border border-line bg-surface">
                <button onClick={() => toggle(b.id)} className="flex w-full items-center gap-3 p-4 text-left">
                  {open ? <ChevronDown className="size-4 text-ink-faint" /> : <ChevronRight className="size-4 text-ink-faint" />}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{b.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[b.status] ?? STATUS_STYLE.draft}`}>{b.status}</span>
                      {b.quarter && <span className="text-xs text-ink-faint">Q{b.quarter}</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-xs text-ink-muted">
                      <span>{fmt(b.total)} budgeted</span>
                      <span>{fmt(spent)} spent ({pct}%)</span>
                      <span>{b.items.length} line items</span>
                    </div>
                  </div>
                  <form action={(fd) => start(async () => { fd.set("id", b.id); await deleteBudget(fd); toast("Budget deleted", "info"); })} onClick={(e) => e.stopPropagation()}>
                    <button type="submit" disabled={pending} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                </button>

                {open && (
                  <div className="border-t border-line p-4">
                    {/* Progress bar */}
                    <div className="mb-4 h-2 rounded-full bg-surface-2">
                      <div className={cn("h-2 rounded-full", pct > 90 ? "bg-danger" : pct > 70 ? "bg-gold" : "bg-success")} style={{ width: `${pct}%` }} />
                    </div>

                    {b.items.length === 0 ? (
                      <p className="text-sm text-ink-faint">No line items yet.</p>
                    ) : (
                      <div className="mb-4 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-line text-left text-xs text-ink-faint">
                              <th className="pb-2 pr-3">Category</th>
                              <th className="pb-2 pr-3">Description</th>
                              <th className="pb-2 pr-3 text-right">Budgeted</th>
                              <th className="pb-2 pr-3 text-right">Spent</th>
                              <th className="pb-2 text-right">%</th>
                              <th className="pb-2 w-8" />
                            </tr>
                          </thead>
                          <tbody>
                            {b.items.map((item) => {
                              const itemPct = item.amount > 0 ? Math.round((item.spent / item.amount) * 100) : 0;
                              return (
                                <tr key={item.id} className="border-b border-line/50">
                                  <td className="py-2 pr-3 font-medium">{item.category}</td>
                                  <td className="py-2 pr-3 text-ink-muted">{item.description}</td>
                                  <td className="py-2 pr-3 text-right">{fmt(item.amount)}</td>
                                  <td className="py-2 pr-3 text-right">{fmt(item.spent)}</td>
                                  <td className={cn("py-2 text-right text-xs", itemPct > 100 ? "font-bold text-danger" : "")}>{itemPct}%</td>
                                  <td className="py-2 text-right">
                                    <form action={(fd) => start(async () => { fd.set("id", item.id); await deleteBudgetItem(fd); toast("Item removed", "info"); })}>
                                      <button type="submit" disabled={pending} className="grid size-6 place-items-center rounded text-ink-faint hover:text-danger">
                                        <Trash2 className="size-3.5" />
                                      </button>
                                    </form>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <ActionDialog
                      triggerLabel="Add line item"
                      triggerIcon={<Plus />}
                                            title="Add budget line item"
                      description={`Add a line item to "${b.name}"`}
                      submitLabel="Add"
                      action={addItemAction}
                      disabled={isDemo}
                    >
                      <input type="hidden" name="budgetId" value={b.id} />
                      <Field label="Category" name="category" type="select" options={[
                        "Salaries & stipends", "Utilities", "Rent / lease", "Maintenance", "Missions",
                        "Youth ministry", "Music & worship", "Events", "Outreach", "Media & technology",
                        "Office supplies", "Transport", "Welfare", "Construction", "Other",
                      ]} required />
                      <Field label="Description" name="description" placeholder="e.g. Monthly electricity bill" required />
                      <Field label="Amount (GHS)" name="amount" type="number" placeholder="0.00" required />
                    </ActionDialog>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
