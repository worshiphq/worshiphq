"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Smartphone, Banknote, Plus, Star, Pencil, Trash2, ArrowLeftRight, X, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { OnFormComplete } from "@/components/ui/form-effects";
import { useFeedback } from "@/components/ui/feedback";
import { createAccount, updateAccount, deleteAccount, setDefaultAccount, transferBetweenAccounts } from "@/app/actions/accounts";
import { cn } from "@/lib/utils";

export interface AccountRow {
  id: string;
  name: string;
  type: string;
  bankName: string | null;
  accountNumber: string | null;
  openingBalance: number;
  isDefault: boolean;
  balance: number;
  inflow: number;
  outflow: number;
}

const TYPE_META: Record<string, { icon: typeof Landmark; label: string }> = {
  bank: { icon: Landmark, label: "Bank" },
  "mobile-money": { icon: Smartphone, label: "Mobile Money" },
  cash: { icon: Banknote, label: "Cash" },
};

const fmt = (n: number) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(n);
const inputCls = "h-10 w-full rounded-xl border border-line bg-base px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

export function AccountsManager({ accounts, canWrite }: { accounts: AccountRow[]; canWrite: boolean }) {
  const [drawer, setDrawer] = useState<"new" | "transfer" | { edit: AccountRow } | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useFeedback();
  const router = useRouter();

  const total = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <Card className="mb-4 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-display text-base font-semibold">
            <Landmark className="size-4" /> Accounts
          </h3>
          <p className="text-xs text-ink-muted">Total across all accounts: <b className="text-ink">{fmt(total)}</b></p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            {accounts.length >= 2 && (
              <Button size="sm" variant="secondary" onClick={() => setDrawer("transfer")}>
                <ArrowLeftRight className="size-4" /> Transfer
              </Button>
            )}
            <Button size="sm" onClick={() => setDrawer("new")}>
              <Plus className="size-4" /> New account
            </Button>
          </div>
        )}
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-faint">
          No accounts yet. Add your bank, Mobile Money or cash accounts so giving and expenses land in the right place.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => {
            const meta = TYPE_META[a.type] ?? TYPE_META.bank;
            const Icon = meta.icon;
            return (
              <div key={a.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-4.5" /></span>
                    <div>
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        {a.name}
                        {a.isDefault && <Star className="size-3 fill-gold text-gold" />}
                      </div>
                      <div className="text-[11px] text-ink-faint">
                        {meta.label}{a.bankName ? ` · ${a.bankName}` : ""}{a.accountNumber ? ` · ${a.accountNumber}` : ""}
                      </div>
                    </div>
                  </div>
                  {canWrite && (
                    <div className="flex gap-0.5">
                      <button title="Edit" onClick={() => setDrawer({ edit: a })} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-surface-2 hover:text-ink"><Pencil className="size-3.5" /></button>
                      <button
                        title="Delete account"
                        onClick={() => { if (confirm(`Delete account "${a.name}"? Its transactions stay but become unassigned.`)) start(async () => { await deleteAccount(a.id); toast("Account deleted", "info"); router.refresh(); }); }}
                        className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"
                      ><Trash2 className="size-3.5" /></button>
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <div className={cn("font-display text-2xl font-bold", a.balance < 0 ? "text-danger" : "text-ink")}>{fmt(a.balance)}</div>
                  <div className="mt-0.5 flex gap-3 text-[11px]">
                    <span className="text-success">+{fmt(a.inflow)} in</span>
                    <span className="text-danger">−{fmt(a.outflow)} out</span>
                  </div>
                </div>

                {canWrite && !a.isDefault && (
                  <button
                    onClick={() => start(async () => { await setDefaultAccount(a.id); toast(`${a.name} is now the default`, "success"); router.refresh(); })}
                    disabled={pending}
                    className="mt-3 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    Make default
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Drawers ── */}
      {drawer && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setDrawer(null)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-line bg-surface shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
              <h2 className="font-display text-lg font-semibold">
                {drawer === "new" ? "New account" : drawer === "transfer" ? "Transfer between accounts" : "Edit account"}
              </h2>
              <button onClick={() => setDrawer(null)} className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"><X className="size-5" /></button>
            </div>

            {drawer === "transfer" ? (
              <form
                className="space-y-4 p-5"
                action={(fd) => start(async () => {
                  const res = await transferBetweenAccounts(fd);
                  if (!res?.ok) return toast(res?.error ?? "Couldn't transfer", "error");
                  toast("Transfer recorded", "success"); setDrawer(null); router.refresh();
                })}
              >
                <div>
                  <Label>From</Label>
                  <select name="fromId" required className={inputCls} defaultValue={accounts.find((a) => a.isDefault)?.id ?? ""}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)}</option>)}
                  </select>
                </div>
                <div>
                  <Label>To</Label>
                  <select name="toId" required className={inputCls} defaultValue="">
                    <option value="" disabled>Choose account…</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Amount (₵)</Label>
                  <Input name="amount" type="number" step="0.01" min="0" placeholder="0.00" required />
                </div>
                <div>
                  <Label>Note (optional)</Label>
                  <Input name="note" placeholder="e.g. move offering to savings" />
                </div>
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? <><Loader2 className="mr-2 size-4 animate-spin" /> Transferring…</> : "Record transfer"}
                </Button>
              </form>
            ) : (
              <form
                action={drawer === "new" ? createAccount : updateAccount}
                className="space-y-4 p-5"
              >
                <OnFormComplete onComplete={() => setDrawer(null)} />
                {typeof drawer === "object" && <input type="hidden" name="id" value={drawer.edit.id} />}
                <div>
                  <Label>Account name</Label>
                  <Input name="name" placeholder="e.g. Main Bank Account" required defaultValue={typeof drawer === "object" ? drawer.edit.name : ""} />
                </div>
                <div>
                  <Label>Type</Label>
                  <select name="type" className={inputCls} defaultValue={typeof drawer === "object" ? drawer.edit.type : "bank"}>
                    <option value="bank">Bank</option>
                    <option value="mobile-money">Mobile Money</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Bank / provider (optional)</Label>
                    <Input name="bankName" placeholder="GCB, MTN…" defaultValue={typeof drawer === "object" ? drawer.edit.bankName ?? "" : ""} />
                  </div>
                  <div>
                    <Label>Number (optional)</Label>
                    <Input name="accountNumber" placeholder="Acct / MoMo no." defaultValue={typeof drawer === "object" ? drawer.edit.accountNumber ?? "" : ""} />
                  </div>
                </div>
                <div>
                  <Label>Opening balance (₵)</Label>
                  <Input name="openingBalance" type="number" step="0.01" min="0" placeholder="0.00" defaultValue={typeof drawer === "object" ? String(drawer.edit.openingBalance) : "0"} />
                  <p className="mt-1 text-xs text-ink-faint">What&rsquo;s already in the account today. Giving &amp; expenses adjust it from here.</p>
                </div>
                <SubmitButton className="w-full" pendingLabel="Saving…" successMessage={drawer === "new" ? "Account added" : "Account updated"}>
                  {drawer === "new" ? "Add account" : "Save changes"}
                </SubmitButton>
              </form>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
