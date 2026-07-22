"use client";

import { useState, useTransition } from "react";
import { Trash2, ChevronDown, ChevronRight, Plus, Loader2, ArrowUpRight, ArrowDownRight } from "lucide-react";
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
interface BudgetEntry {
  id: string;
  type: "income" | "expense";
  description: string;
  category: string | null;
  amount: number;
  date: string;
}
interface Budget {
  id: string;
  name: string;
  year: number;
  quarter: number | null;
  status: string;
  total: number;
  notes: string | null;
  department: string | null;
  items: BudgetItem[];
  entries: BudgetEntry[];
}

type EntryResult = { ok: boolean; error?: string };

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-ink-faint/10 text-ink-faint",
  approved: "bg-brand/10 text-brand",
  active: "bg-success/10 text-success",
  closed: "bg-ink-muted/10 text-ink-muted",
};

const fmt = (n: number) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(n);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** allocated + income received − spent. */
function tally(b: Budget) {
  const income = b.entries.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
  const spent = b.entries.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);
  return { income, spent, balance: b.total + income - spent };
}

export function BudgetsClient({
  budgets,
  isLeader,
  addItemAction,
  addEntryAction,
  deleteEntryAction,
  isDemo,
}: {
  budgets: Budget[];
  isLeader: boolean;
  addItemAction: (fd: FormData) => Promise<void>;
  addEntryAction: (fd: FormData) => Promise<EntryResult>;
  deleteEntryAction: (fd: FormData) => Promise<void>;
  isDemo: boolean;
}) {
  // Leaders land with their (usually single) budget open.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    isLeader && budgets[0] ? { [budgets[0].id]: true } : {},
  );
  const [pending, start] = useTransition();
  const { toast } = useFeedback();

  const totalAllocated = budgets.reduce((s, b) => s + b.total, 0);
  const totalIncome = budgets.reduce((s, b) => s + tally(b).income, 0);
  const totalSpent = budgets.reduce((s, b) => s + tally(b).spent, 0);
  const totalBalance = totalAllocated + totalIncome - totalSpent;

  function toggle(id: string) {
    setExpanded((p) => ({ ...p, [id]: !p[id] }));
  }

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Allocated" value={fmt(totalAllocated)} />
        <Stat label="Income logged" value={fmt(totalIncome)} tone="success" />
        <Stat label="Spent" value={fmt(totalSpent)} tone={totalSpent > totalAllocated + totalIncome ? "danger" : "default"} />
        <Stat label="Balance" value={fmt(totalBalance)} tone={totalBalance < 0 ? "danger" : "brand"} />
      </div>

      {budgets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink-faint">
          {isLeader
            ? "No budget has been set up for your department yet. Your church admin will create one."
            : "No budgets created yet. Use the button above to start a budget."}
        </div>
      ) : (
        <div className="grid gap-3">
          {budgets.map((b) => {
            const open = expanded[b.id] ?? false;
            const t = tally(b);
            const pct = b.total > 0 ? Math.min(100, Math.round((t.spent / b.total) * 100)) : 0;
            return (
              <div key={b.id} className="rounded-2xl border border-line bg-surface">
                <button onClick={() => toggle(b.id)} className="flex w-full items-center gap-3 p-4 text-left">
                  {open ? <ChevronDown className="size-4 text-ink-faint" /> : <ChevronRight className="size-4 text-ink-faint" />}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{b.name}</span>
                      {b.department && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">{b.department}</span>}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[b.status] ?? STATUS_STYLE.draft}`}>{b.status}</span>
                      {b.quarter && <span className="text-xs text-ink-faint">Q{b.quarter}</span>}
                      <span className="text-xs text-ink-faint">{b.year}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-ink-muted">
                      <span>{fmt(b.total)} allocated</span>
                      <span className="text-success">+{fmt(t.income)} in</span>
                      <span className="text-danger">−{fmt(t.spent)} out</span>
                      <span className={cn("font-semibold", t.balance < 0 ? "text-danger" : "text-ink")}>{fmt(t.balance)} balance</span>
                    </div>
                  </div>
                  {!isLeader && (
                    <form action={(fd) => start(async () => { fd.set("id", b.id); await deleteBudget(fd); toast("Budget deleted", "info"); })} onClick={(e) => e.stopPropagation()}>
                      <button type="submit" disabled={pending} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger disabled:pointer-events-none">
                        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      </button>
                    </form>
                  )}
                </button>

                {open && (
                  <div className="border-t border-line p-4">
                    {/* Spend progress vs allocation */}
                    <div className="mb-4 h-2 rounded-full bg-surface-2">
                      <div className={cn("h-2 rounded-full", pct > 90 ? "bg-danger" : pct > 70 ? "bg-gold" : "bg-success")} style={{ width: `${pct}%` }} />
                    </div>

                    {/* ── Income / expense ledger ── */}
                    <div className="mb-4">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Income &amp; expenses</div>
                      {b.entries.length === 0 ? (
                        <p className="text-sm text-ink-faint">Nothing recorded yet. Add your first income or expense below.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <tbody>
                              {b.entries.map((e) => (
                                <tr key={e.id} className="border-b border-line/50">
                                  <td className="py-2 pr-2 w-6">
                                    {e.type === "income"
                                      ? <ArrowUpRight className="size-4 text-success" />
                                      : <ArrowDownRight className="size-4 text-danger" />}
                                  </td>
                                  <td className="py-2 pr-3">
                                    <div className="font-medium">{e.description}</div>
                                    {e.category && <div className="text-xs text-ink-faint">{e.category}</div>}
                                  </td>
                                  <td className="py-2 pr-3 text-xs text-ink-faint whitespace-nowrap">{shortDate(e.date)}</td>
                                  <td className={cn("py-2 pr-3 text-right font-semibold whitespace-nowrap", e.type === "income" ? "text-success" : "text-danger")}>
                                    {e.type === "income" ? "+" : "−"}{fmt(e.amount)}
                                  </td>
                                  <td className="py-2 text-right w-8">
                                    <form action={(fd) => start(async () => { fd.set("id", e.id); await deleteEntryAction(fd); toast("Entry removed", "info"); })}>
                                      <button type="submit" disabled={pending} className="grid size-6 place-items-center rounded text-ink-faint hover:text-danger disabled:pointer-events-none">
                                        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                                      </button>
                                    </form>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {!isDemo && <AddEntryForm budgetId={b.id} action={addEntryAction} />}
                    </div>

                    {/* ── Planned line items (admin only) ── */}
                    {!isLeader && (
                      <div className="rounded-xl border border-line-soft bg-surface-2/40 p-3">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Planned line items</div>
                        {b.items.length > 0 && (
                          <div className="mb-3 overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-line text-left text-xs text-ink-faint">
                                  <th className="pb-2 pr-3">Category</th>
                                  <th className="pb-2 pr-3">Description</th>
                                  <th className="pb-2 pr-3 text-right">Budgeted</th>
                                  <th className="pb-2 w-8" />
                                </tr>
                              </thead>
                              <tbody>
                                {b.items.map((item) => (
                                  <tr key={item.id} className="border-b border-line/50">
                                    <td className="py-2 pr-3 font-medium">{item.category}</td>
                                    <td className="py-2 pr-3 text-ink-muted">{item.description}</td>
                                    <td className="py-2 pr-3 text-right">{fmt(item.amount)}</td>
                                    <td className="py-2 text-right">
                                      <form action={(fd) => start(async () => { fd.set("id", item.id); await deleteBudgetItem(fd); toast("Item removed", "info"); })}>
                                        <button type="submit" disabled={pending} className="grid size-6 place-items-center rounded text-ink-faint hover:text-danger disabled:pointer-events-none">
                                          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                                        </button>
                                      </form>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <ActionDialog
                          triggerLabel="Add line item"
                          triggerIcon={<Plus />}
                          title="Add budget line item"
                          description={`Add a planned line item to "${b.name}"`}
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
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "brand" | "success" | "danger" }) {
  const toneCls = { default: "text-ink", brand: "text-brand", success: "text-success", danger: "text-danger" }[tone];
  return (
    <div className="rounded-xl border border-line bg-surface p-3 text-center">
      <div className={cn("text-xl font-bold", toneCls)}>{value}</div>
      <div className="text-xs text-ink-muted">{label}</div>
    </div>
  );
}

function AddEntryForm({ budgetId, action }: { budgetId: string; action: (fd: FormData) => Promise<EntryResult> }) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [pending, start] = useTransition();
  const { toast } = useFeedback();

  return (
    <form
      className="mt-3 grid gap-2 rounded-xl border border-line bg-surface p-3 sm:grid-cols-[auto_1fr_auto_auto]"
      action={(fd) =>
        start(async () => {
          fd.set("budgetId", budgetId);
          fd.set("type", type);
          const res = await action(fd);
          if (!res.ok) return toast(res.error ?? "Couldn't save", "error");
          toast(type === "income" ? "Income recorded" : "Expense recorded", "success");
          (document.getElementById(`entry-desc-${budgetId}`) as HTMLInputElement | null)?.form?.reset();
        })
      }
    >
      <div className="flex rounded-lg border border-line p-0.5 text-xs font-medium">
        <button type="button" onClick={() => setType("expense")} className={cn("rounded-md px-3 py-1.5", type === "expense" ? "bg-danger/10 text-danger" : "text-ink-muted")}>Expense</button>
        <button type="button" onClick={() => setType("income")} className={cn("rounded-md px-3 py-1.5", type === "income" ? "bg-success/10 text-success" : "text-ink-muted")}>Income</button>
      </div>
      <input id={`entry-desc-${budgetId}`} name="description" placeholder="What was it for?" required
        className="h-9 rounded-lg border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none" />
      <input name="amount" type="number" step="0.01" min="0" placeholder="Amount (₵)" required
        className="h-9 w-28 rounded-lg border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none" />
      <button type="submit" disabled={pending} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-white disabled:opacity-60">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
      </button>
    </form>
  );
}
