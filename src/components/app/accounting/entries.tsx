"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Check, Pencil, Trash2, X, HandCoins, Receipt, Banknote, Landmark, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/components/ui/feedback";
import { deleteTransaction, editTransaction, moveLedgerEntryAccount } from "@/app/actions/accounting";
import { formatCurrency } from "@/config/brand";
import { cn } from "@/lib/utils";
import { confirmBinDelete } from "@/lib/recycle-bin-events";
import { BIN_TOAST } from "@/lib/recycle-bin-config";
import type { Ledger, LedgerRow } from "@/lib/data/ledger";
import { type LedgerAccount, useLedgerNav, signed } from "./shared";

export const AccountsContext = createContext<LedgerAccount[]>([]);

const ICON = { giving: HandCoins, expense: Receipt, manual: Banknote };
const TONE = { giving: "bg-success/10 text-success", expense: "bg-danger/10 text-danger", manual: "bg-surface-2 text-ink-muted" };

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/* ────── Move an entry to another account ────── */

export function MoveAccountControl({ row, onMoved }: { row: LedgerRow; onMoved?: () => void }) {
  const accounts = useContext(AccountsContext);
  const [pending, start] = useTransition();
  const { toast } = useFeedback();
  const router = useRouter();

  if (accounts.length < 2 || row.group) return null; // nothing to move between
  // An entry with no account isn't "in" the default - it's just folded into it for the
  // totals. Show it as unassigned so every account (Main included) is a real target.
  const currentId = accounts.find((a) => a.id === row.accountId)?.id ?? "";

  const move = (accountId: string) => {
    if (!accountId || accountId === currentId) return;
    start(async () => {
      const res = await moveLedgerEntryAccount(row.source, row.id, accountId);
      if (res?.ok) { toast(`Moved to ${res.accountName}`, "success"); onMoved ? onMoved() : router.refresh(); }
      else toast(res?.error ?? "Couldn't move", "error");
    });
  };

  return (
    <span className="inline-flex items-center gap-1" title="Move this money to another account">
      {pending ? <div className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent text-ink-faint" /> : <Landmark className="size-3 text-ink-faint" />}
      <select
        value={currentId}
        onChange={(e) => move(e.target.value)}
        disabled={pending}
        className="max-w-[9rem] truncate rounded-lg border border-line bg-surface px-1.5 py-1 text-xs text-ink-muted outline-none hover:border-primary/40 focus:border-primary/50"
      >
        {currentId === "" && <option value="">Assign account…</option>}
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.isDefault ? " (default)" : ""}</option>)}
      </select>
    </span>
  );
}

/* ────── Entries list ────── */

export function EntriesView({ ledger, canWrite, canDelete }: { ledger: Ledger; canWrite: boolean; canDelete: boolean }) {
  const nav = useLedgerNav(ledger);
  const { rows, pageInfo, filters } = ledger;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const shown = rows.filter((r) => !hidden.has(r.id));

  // A heading each time the day changes (only meaningful when sorted by date).
  const byDate = filters.sort !== "largest";
  let lastDay = "";

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h3 className="font-display text-[1rem] font-semibold">Entries</h3>
          <p className="text-xs text-ink-muted">
            {pageInfo.total === 0 ? "Nothing matches" : `${pageInfo.total.toLocaleString()} ${filters.group ? "lines" : "entries"}`}
            {ledger.activeFilters > 0 ? " with your filters" : ` for ${ledger.label}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted" title="Show each day's gifts to a fund as one line you can open">
            <input type="checkbox" checked={filters.group} onChange={(e) => nav.go({ filters: { group: e.target.checked } })} className="size-3.5 accent-primary" />
            Summarise giving by day
          </label>
          <select value={filters.sort} onChange={(e) => nav.go({ filters: { sort: e.target.value as typeof filters.sort } })} className="h-8 rounded-lg border border-line bg-surface px-2 text-xs">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="largest">Largest first</option>
          </select>
        </div>
      </div>

      <div className={cn("transition-opacity", nav.pending && "opacity-50")}>
        {shown.length === 0 ? (
          <div className="grid place-items-center gap-2 px-6 py-14 text-center text-sm text-ink-muted">
            <Inbox className="size-8 text-ink-faint/60" />
            {ledger.activeFilters > 0 ? (
              <>
                No entries match these filters.
                <Button size="sm" variant="secondary" onClick={nav.clearFilters}>Clear filters</Button>
              </>
            ) : "No money recorded in this period."}
          </div>
        ) : (
          <div className="divide-y divide-line-soft">
            {shown.map((r) => {
              const day = r.date.slice(0, 10);
              const heading = byDate && day !== lastDay ? ((lastDay = day), dayLabel(r.date)) : null;
              return (
                <div key={r.id}>
                  {heading && <div className="bg-surface-2/50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{heading}</div>}
                  <EntryRow row={r} canWrite={canWrite} canDelete={canDelete} onHide={(id) => setHidden((p) => new Set(p).add(id))} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pageInfo.pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className="text-xs text-ink-faint">
            {(pageInfo.page - 1) * pageInfo.pageSize + 1}-{Math.min(pageInfo.total, pageInfo.page * pageInfo.pageSize)} of {pageInfo.total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="secondary" disabled={pageInfo.page <= 1 || nav.pending} onClick={() => nav.go({ filters: { page: pageInfo.page - 1 } })}><ChevronLeft className="size-4" /> Prev</Button>
            <span className="px-1 text-xs text-ink-muted">Page {pageInfo.page} of {pageInfo.pages}</span>
            <Button size="sm" variant="secondary" disabled={pageInfo.page >= pageInfo.pages || nav.pending} onClick={() => nav.go({ filters: { page: pageInfo.page + 1 } })}>Next <ChevronRight className="size-4" /></Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ────── One entry ────── */

function EntryRow({ row, canWrite, canDelete, onHide }: { row: LedgerRow; canWrite: boolean; canDelete: boolean; onHide: (id: string) => void }) {
  const accounts = useContext(AccountsContext);
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState(row.description);
  const [amount, setAmount] = useState(String(Math.abs(row.amount)));
  const [category, setCategory] = useState(row.category);
  const [fund, setFund] = useState(row.fund);
  const [pending, start] = useTransition();
  const { toast } = useFeedback();
  const router = useRouter();

  const Icon = ICON[row.source];
  const accountName = accounts.find((a) => a.id === row.accountId)?.name;
  const isGroup = !!row.group;
  const manual = row.source === "manual";

  const save = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("description", desc);
      fd.set("amount", row.amount >= 0 ? amount : String(-Math.abs(Number(amount))));
      fd.set("category", category);
      fd.set("fund", fund);
      const res = await editTransaction(row.id, fd);
      if (!res?.ok) toast(res?.error ?? "Failed to update", "error");
      else { toast("Entry updated", "success"); setMode("view"); router.refresh(); }
    });

  const remove = () => {
    if (!confirmBinDelete("Delete this entry?")) return;
    onHide(row.id);
    toast(BIN_TOAST, "success");
    deleteTransaction(row.id).then(() => router.refresh());
  };

  if (mode === "edit") {
    const inp = "rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary/50";
    return (
      <div className="flex flex-wrap items-center gap-2 bg-primary/5 px-4 py-3">
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" className={cn(inp, "min-w-0 flex-1")} />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className={cn(inp, "w-28")} />
        <input value={fund} onChange={(e) => setFund(e.target.value)} placeholder="Fund" className={cn(inp, "w-28")} />
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-faint">GHS</span>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={cn(inp, "w-28 pl-10 text-right font-medium")} />
        </div>
        <button onClick={save} disabled={pending} className="grid size-8 place-items-center rounded-lg text-success hover:bg-success/10" title="Save">
          {pending ? <div className="size-3.5 animate-spin rounded-full border-2 border-success border-t-transparent" /> : <Check className="size-4" />}
        </button>
        <button onClick={() => setMode("view")} className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-surface-2" title="Cancel"><X className="size-4" /></button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", TONE[row.source])}><Icon className="size-3.5" /></span>
        <button type="button" onClick={() => isGroup && setOpen((v) => !v)} className={cn("min-w-0 flex-1 text-left", !isGroup && "cursor-default")}>
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{row.description}</span>
            {isGroup && <ChevronDown className={cn("size-3.5 shrink-0 text-ink-faint transition-transform", open && "rotate-180")} />}
          </div>
          <div className="truncate text-xs text-ink-faint">
            {row.category}{row.fund && row.fund !== row.category ? ` · ${row.fund}` : ""}{row.method ? ` · ${row.method}` : ""}{accountName ? ` · ${accountName}` : ""}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {canWrite && mode === "view" && !isGroup && <div className="hidden sm:block"><MoveAccountControl row={row} /></div>}
          <span className={cn("whitespace-nowrap font-display text-sm font-semibold tabular-nums", row.amount >= 0 ? "text-success" : "text-danger")}>
            {signed(row.amount, formatCurrency, true)}
          </span>
          {canWrite && manual && mode === "view" && (
            <div className="flex">
              <button onClick={() => setMode("edit")} title="Edit entry" className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary/10 hover:text-primary"><Pencil className="size-3.5" /></button>
              {canDelete && <button onClick={() => setMode("delete")} title="Delete entry" className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>}
            </div>
          )}
          {mode === "delete" && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-danger">Delete?</span>
              <button onClick={remove} disabled={pending} className="grid size-7 place-items-center rounded-lg text-danger hover:bg-danger/10"><Check className="size-3.5" /></button>
              <button onClick={() => setMode("view")} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-surface-2"><X className="size-3.5" /></button>
            </div>
          )}
        </div>
      </div>

      {/* On phones the account mover sits under the row. */}
      {canWrite && mode === "view" && !isGroup && accounts.length >= 2 && (
        <div className="px-4 pb-2 pl-15 sm:hidden"><MoveAccountControl row={row} /></div>
      )}

      {isGroup && open && (
        <div className="border-t border-line-soft bg-surface-2/30">
          {row.group!.map((g) => (
            <div key={g.id} className="flex items-center gap-3 px-4 py-1.5 pl-14 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink-muted">{g.description.replace(/ - [^-]+$/, "")}</span>
              <span className="hidden text-xs text-ink-faint sm:block">{g.method}</span>
              {canWrite && <MoveAccountControl row={g} />}
              <span className="whitespace-nowrap text-xs font-medium tabular-nums text-success">{signed(g.amount, formatCurrency, true)}</span>
            </div>
          ))}
          {row.group!.length >= 300 && <p className="px-4 py-2 pl-14 text-[11px] text-ink-faint">Showing the latest 300 gifts of this day.</p>}
        </div>
      )}
      {isGroup && !open && <Badge variant="default" className="sr-only">{row.group!.length} gifts</Badge>}
    </>
  );
}
