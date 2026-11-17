"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { createExpense, updateExpense, requestExpense, payExpenseRequest, saveVendor } from "@/app/actions/expenses";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { SearchSelect } from "@/components/app/search-select";
import { ReceiptInput } from "@/components/app/expenses/receipt-input";
import { Sheet, BusyButton, FormError, F, Select, ChipChoice, money, todayYmd, ymdOf } from "@/components/app/shared/kit";
import { PAYMENT_METHODS } from "@/lib/assets/categories";
import { cn } from "@/lib/utils";

export type Vendor = { id: string; name: string; phone: string | null; momoNumber: string | null; category: string | null };
export type BudgetUse = { id: string; name: string; allocated: number; used: number; items: { id: string; description: string; category: string; amount: number; used: number }[] };
export type FormLists = {
  accounts: { id: string; name: string; isDefault: boolean }[];
  funds: { id: string; name: string; restricted: boolean; left: number }[];
  vendors: Vendor[];
  budgets: BudgetUse[];
  categories: string[];
  topCategories: string[];
  fundAccounting: boolean;
  budgetsOn: boolean;
};

export type ExpenseValue = {
  id: string; description: string; amount: number; category: string; date: string; vendor: string | null; vendorId: string | null; receiptRef: string | null;
  receiptUrl: string | null; paymentMethod: string | null; accountId: string | null; fundId: string | null; budgetId: string | null; budgetItemId: string | null; notes: string | null;
};

/** Pick a payee from the list, or add a new one without leaving the form. */
function PayeePicker({ vendors, vendorId, vendorText, onChange }: { vendors: Vendor[]; vendorId: string; vendorText: string; onChange: (id: string, text: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [list, setList] = useState(vendors);
  const [error, setError] = useState("");
  const add = () => {
    if (!name.trim()) return;
    const fd = new FormData();
    fd.set("name", name.trim());
    start(async () => {
      const r = await saveVendor(fd);
      if (r.ok && r.id) { setList((l) => (l.some((v) => v.id === r.id) ? l : [...l, { id: r.id!, name: name.trim(), phone: null, momoNumber: null, category: null }])); onChange(r.id, name.trim()); setAdding(false); setName(""); setError(""); }
      else setError(r.error ?? "Could not add.");
    });
  };
  if (adding) {
    return (
      <div>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Payee name, e.g. ECG" autoFocus onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <BusyButton type="button" busy={pending} busyLabel="Adding…" onClick={add} size="sm" className="h-11">Add</BusyButton>
          <Button type="button" variant="ghost" size="sm" className="h-11" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <SearchSelect
        className="flex-1"
        value={vendorId}
        onChange={(v, o) => onChange(v, v ? o?.label ?? "" : "")}
        options={[{ value: "", label: vendorText && !vendorId ? vendorText : "No payee" }, ...list.map((v) => ({ value: v.id, label: v.name, hint: v.category ?? undefined, phone: v.momoNumber ?? v.phone }))]}
        placeholder="Who was paid"
      />
      <Button type="button" variant="secondary" size="sm" className="h-11 shrink-0" onClick={() => setAdding(true)}><Plus /> New</Button>
    </div>
  );
}

/** Budget, then a line in it, with what is left on that line as you type the amount. */
function BudgetPicker({ budgets, budgetItemId, amount, onChange }: { budgets: BudgetUse[]; budgetItemId: string; amount: number; onChange: (budgetId: string, itemId: string) => void }) {
  const owner = budgets.find((b) => b.items.some((i) => i.id === budgetItemId));
  const [budgetId, setBudgetId] = useState(owner?.id ?? "");
  const b = budgets.find((x) => x.id === budgetId);
  const item = b?.items.find((i) => i.id === budgetItemId);
  const left = item ? item.amount - item.used : b ? b.allocated - b.used : null;
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={budgetId} onChange={(v) => { setBudgetId(v); onChange(v, ""); }} options={[{ value: "", label: "No budget" }, ...budgets.map((x) => ({ value: x.id, label: x.name }))]} />
        {b && b.items.length > 0 && <Select value={budgetItemId} onChange={(v) => onChange(budgetId, v)} options={[{ value: "", label: "Whole budget" }, ...b.items.map((i) => ({ value: i.id, label: i.description }))]} />}
      </div>
      {left != null && (
        <p className={cn("text-xs font-medium tabular-nums", amount > left ? "text-warning" : "text-ink-muted")}>
          {amount > left ? `This goes ${money(amount - left)} over the ${item ? "line" : "budget"}.` : `${money(left - amount)} left on this ${item ? "line" : "budget"}${amount ? " after this" : ""}.`}
        </p>
      )}
    </div>
  );
}

type Mode = { kind: "record" } | { kind: "edit"; value: ExpenseValue } | { kind: "request" } | { kind: "pay"; requestId: string; value: Partial<ExpenseValue> };

export function ExpenseForm({ mode, lists, approvalOver, isOwner, onClose }: { mode: Mode; lists: FormLists; approvalOver?: number | null; isOwner?: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const init: Partial<ExpenseValue> = mode.kind === "edit" || mode.kind === "pay" ? mode.value : {};
  const [amount, setAmount] = useState(init.amount ? String(init.amount) : "");
  const [category, setCategory] = useState(init.category ?? "");
  const [other, setOther] = useState(!!init.category && !lists.topCategories.includes(init.category));
  const [method, setMethod] = useState(init.paymentMethod ?? "cash");
  const [vendorId, setVendorId] = useState(init.vendorId ?? "");
  const [vendorText, setVendorText] = useState(init.vendor ?? "");
  const [budget, setBudget] = useState({ budgetId: init.budgetId ?? "", itemId: init.budgetItemId ?? "" });
  const [more, setMore] = useState(!!(init.receiptRef || init.notes));
  const isRequest = mode.kind === "request";
  const amt = Number(amount) || 0;
  const chips = useMemo(() => [...new Set([...lists.topCategories, ...["General", "Utilities", "Transport", "Maintenance", "Supplies", "Events"]])].slice(0, 6), [lists.topCategories]);
  const willQueue = mode.kind === "record" && !isOwner && approvalOver != null && approvalOver > 0 && amt > approvalOver;

  const title = mode.kind === "edit" ? "Edit expense" : mode.kind === "request" ? "Request money" : mode.kind === "pay" ? "Pay this request" : "Record expense";
  const submitLabel = mode.kind === "edit" ? "Save changes" : mode.kind === "request" ? "Send request" : mode.kind === "pay" ? "Record payment" : willQueue ? "Send for approval" : "Record expense";

  const submit = (fd: FormData) => {
    setError("");
    fd.set("category", category || "General");
    fd.set("paymentMethod", method);
    fd.set("vendorId", vendorId);
    fd.set("vendor", vendorText);
    fd.set("budgetId", budget.budgetId);
    fd.set("budgetItemId", budget.itemId);
    if (mode.kind === "edit") fd.set("id", mode.value.id);
    if (mode.kind === "pay") { fd.set("id", mode.requestId); fd.set("approveFirst", "1"); }
    start(async () => {
      const r = mode.kind === "edit" ? await updateExpense(fd) : mode.kind === "request" ? await requestExpense(fd) : mode.kind === "pay" ? await payExpenseRequest(fd) : await createExpense(fd);
      if (r.ok) {
        toast(mode.kind === "edit" ? "Changes saved" : mode.kind === "request" || ("queued" in r && r.queued) ? "Sent for approval" : "Expense recorded", "success");
        router.refresh();
        onClose();
      } else setError(r.error ?? "That did not save.");
    });
  };

  return (
    <Sheet open onClose={onClose} busy={pending} wide title={title} description={isRequest ? "Finance approves it before any money is paid." : undefined}>
      <form action={submit} className="space-y-4">
        <div className="rounded-2xl border border-line bg-surface-2/40 p-4">
          <label htmlFor="ef-amt" className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Amount</label>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="font-display text-3xl font-bold text-ink-muted">₵</span>
            <input id="ef-amt" name="amount" type="number" inputMode="decimal" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus={mode.kind !== "edit"}
              readOnly={mode.kind === "pay"}
              className="w-full bg-transparent font-display text-4xl font-bold tabular-nums text-ink outline-none placeholder:text-ink-faint" />
          </div>
          {willQueue && <p className="mt-1 text-xs text-warning">Above {money(approvalOver!)}, so it goes for approval first.</p>}
        </div>

        <F label={isRequest ? "What it is for" : "What it was for"} htmlFor="ef-d"><Input id="ef-d" name="description" defaultValue={init.description ?? ""} required placeholder={isRequest ? "e.g. Chairs for the youth hall" : "e.g. Electricity bill, October"} /></F>

        <F label="Category">
          <ChipChoice value={other ? "__other" : category} onChange={(v) => { if (v === "__other") { setOther(true); setCategory(""); } else { setOther(false); setCategory(v); } }} options={[...chips.map((c) => ({ value: c, label: c })), { value: "__other", label: "Other" }]} />
          {other && (
            <>
              <Input className="mt-2" list="ef-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Type a category" />
              <datalist id="ef-cats">{lists.categories.map((c) => <option key={c} value={c} />)}</datalist>
            </>
          )}
        </F>

        <div className="grid gap-3 sm:grid-cols-2">
          <F label={isRequest ? "Needed by" : "Date"} htmlFor="ef-date">
            {isRequest ? <Input id="ef-date" name="neededBy" type="date" /> : <Input id="ef-date" name="date" type="date" defaultValue={init.date ? ymdOf(init.date) : todayYmd()} />}
          </F>
          <F label="Payee"><PayeePicker vendors={lists.vendors} vendorId={vendorId} vendorText={vendorText} onChange={(id, t) => { setVendorId(id); setVendorText(t); }} /></F>
        </div>

        {!isRequest && (
          <div className="space-y-3">
            <F label="Paid how"><ChipChoice value={method} onChange={setMethod} options={PAYMENT_METHODS.map((m) => ({ value: m.key, label: m.label }))} /></F>
            {lists.accounts.length > 0 && (
              <F label="Paid from" htmlFor="ef-acc"><Select id="ef-acc" name="accountId" defaultValue={init.accountId ?? lists.accounts.find((a) => a.isDefault)?.id ?? ""} options={[{ value: "", label: "No account" }, ...lists.accounts.map((a) => ({ value: a.id, label: a.isDefault ? `${a.name} (default)` : a.name }))]} /></F>
            )}
          </div>
        )}

        <ReceiptInput name={isRequest ? "attachment" : "receipt"} initial={init.receiptUrl} label={isRequest ? "Quote or receipt" : "Receipt"} />

        {lists.budgetsOn && lists.budgets.length > 0 && (
          <F label="Budget line"><BudgetPicker budgets={lists.budgets} budgetItemId={budget.itemId} amount={amt} onChange={(b, i) => setBudget({ budgetId: b, itemId: i })} /></F>
        )}

        {!isRequest && lists.fundAccounting && lists.funds.length > 0 && (
          <F label="Charge to fund" htmlFor="ef-fund" hint="A restricted fund can only be spent up to what has been given to it">
            <Select id="ef-fund" name="fundId" defaultValue={init.fundId ?? ""} options={[{ value: "", label: "No fund" }, ...lists.funds.map((f) => ({ value: f.id, label: f.restricted ? `${f.name} (restricted, ${money(f.left)} left)` : f.name }))]} />
          </F>
        )}

        <div>
          <button type="button" onClick={() => setMore((m) => !m)} className="inline-flex items-center gap-1 text-sm font-medium text-primary"><ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} /> More details</button>
          {more && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {!isRequest && <F label="Receipt number" htmlFor="ef-ref"><Input id="ef-ref" name="receiptRef" defaultValue={init.receiptRef ?? ""} placeholder="Receipt or invoice number" /></F>}
              <F label="Notes" htmlFor="ef-notes" className={isRequest ? "sm:col-span-2" : ""}><Textarea id="ef-notes" name={isRequest ? "note" : "notes"} defaultValue={init.notes ?? ""} rows={2} className="min-h-11" /></F>
            </div>
          )}
        </div>

        <FormError error={error} />
        <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-line bg-surface px-4 pt-3 sm:static sm:mx-0 sm:border-0 sm:px-0">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <BusyButton busy={pending} busyLabel={isRequest ? "Sending…" : "Saving…"} className="flex-1">{submitLabel}</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}
