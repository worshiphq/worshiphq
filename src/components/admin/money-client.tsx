"use client";

import { usePaged } from "@/components/admin/pager";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/ui/app-link";
import { addMoneyEntry, deleteMoneyEntry } from "@/app/actions/owner-money";
import { ArrowLeft, Plus, Trash2, TrendingUp, TrendingDown, Wallet, Loader2, Banknote } from "lucide-react";

type EarnedRow = { id: string; when: string | Date; amountGhs: number; label: string; source: "plan" | "sms" };
type ManualRow = { id: string; when: string | Date; amountGhs: number; kind: "income" | "expense"; category: string | null; note: string | null };
type View = {
  earned: EarnedRow[];
  manual: ManualRow[];
  totals: { earnedGhs: number; manualIncomeGhs: number; incomeGhs: number; expenseGhs: number; leftGhs: number };
};

const cedi = (n: number) =>
  `₵${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string | Date) =>
  new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function MoneyClient({ ledger, site, personal }: { ledger: "site" | "personal"; site: View; personal: View }) {
  const router = useRouter();
  const [book, setBook] = useState<"site" | "personal">(ledger);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const view = book === "site" ? site : personal;

  // One list, newest first, so the two kinds of money read as a single running story.
  const rows = useMemo(() => {
    const all = [
      ...view.earned.map((e) => ({ ...e, type: "earned" as const })),
      ...view.manual.map((m) => ({ ...m, type: "manual" as const })),
    ];
    return all.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
  }, [view]);
  const mp = usePaged(rows, 25);

  const submit = (fd: FormData) => {
    setError(null);
    fd.set("ledger", book);
    fd.set("kind", kind);
    start(async () => {
      const res = await addMoneyEntry(fd);
      if (res.ok) { setAdding(false); router.refresh(); }
      else setError(res.error);
    });
  };

  const remove = (id: string) => {
    if (!confirm("Delete this entry?")) return;
    setBusyId(id);
    start(async () => { await deleteMoneyEntry(id); setBusyId(null); router.refresh(); });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-5">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft className="size-4" /> Admin
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold text-white">Money</h1>
      <p className="text-sm text-slate-400">Private to you. Your partner cannot open this page.</p>

      {/* ── Book switch ── */}
      <div className="mt-4 flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
        {([["site", "WorshipHQ"], ["personal", "My money"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setBook(k)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              book === k ? "bg-teal-500/20 text-teal-200" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── The number that matters ── */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-gradient-to-br from-teal-500/15 to-transparent p-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-teal-300/80">
          <Wallet className="size-3.5" /> Should be left
        </div>
        <div className="mt-1 font-display text-4xl font-bold text-white">{cedi(view.totals.leftGhs)}</div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-black/20 p-3">
            <div className="flex items-center gap-1.5 text-xs text-emerald-300"><TrendingUp className="size-3.5" /> In</div>
            <div className="mt-0.5 font-semibold text-white">{cedi(view.totals.incomeGhs)}</div>
            {book === "site" && view.totals.earnedGhs > 0 && (
              <div className="mt-0.5 text-[11px] text-slate-400">{cedi(view.totals.earnedGhs)} earned automatically</div>
            )}
          </div>
          <div className="rounded-xl bg-black/20 p-3">
            <div className="flex items-center gap-1.5 text-xs text-rose-300"><TrendingDown className="size-3.5" /> Out</div>
            <div className="mt-0.5 font-semibold text-white">{cedi(view.totals.expenseGhs)}</div>
          </div>
        </div>
      </div>

      {/* ── Add ── */}
      {!adding ? (
        <button
          onClick={() => { setAdding(true); setError(null); }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-teal-400"
        >
          <Plus className="size-4" /> Add entry
        </button>
      ) : (
        <form action={submit} className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex gap-1 rounded-lg bg-black/30 p-1">
            {([["expense", "Money out"], ["income", "Money in"]] as const).map(([k, label]) => (
              <button
                type="button"
                key={k}
                onClick={() => setKind(k)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
                  kind === k ? (k === "expense" ? "bg-rose-500/20 text-rose-200" : "bg-emerald-500/20 text-emerald-200") : "text-slate-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            name="amountGhs" inputMode="decimal" placeholder="Amount in cedis" required autoFocus
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-lg text-white placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none"
          />
          <input
            name="category" placeholder="What for? e.g. Paid partner, Hosting"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none"
          />
          <input
            name="occurredAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white focus:border-teal-400/60 focus:outline-none"
          />
          <input
            name="note" placeholder="Note (optional)"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none"
          />
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)} disabled={pending} className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300">Cancel</button>
            <button type="submit" disabled={pending} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-900 disabled:opacity-60">
              {pending ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save"}
            </button>
          </div>
        </form>
      )}

      {/* ── The running story ── */}
      <div className="mt-6 space-y-2">
        {rows.length === 0 && (
          <p className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-slate-400">
            Nothing here yet.
          </p>
        )}
        {mp.slice.map((r) => {
          const out = r.type === "manual" && r.kind === "expense";
          return (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${out ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                {r.type === "earned" ? <Banknote className="size-4" /> : out ? <TrendingDown className="size-4" /> : <TrendingUp className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">
                  {r.type === "earned" ? r.label : (r.category ?? (out ? "Expense" : "Income"))}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {day(r.when)}
                  {r.type === "earned" && <span className="ml-1.5 rounded bg-white/10 px-1 text-[10px]">auto</span>}
                  {r.type === "manual" && r.note && ` · ${r.note}`}
                </p>
              </div>
              <span className={`shrink-0 text-sm font-semibold ${out ? "text-rose-300" : "text-emerald-300"}`}>
                {out ? "-" : "+"}{cedi(r.amountGhs)}
              </span>
              {r.type === "manual" && (
                <button onClick={() => remove(r.id)} disabled={pending} className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300">
                  {busyId === r.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </button>
              )}
            </div>
          );
        })}
        {mp.pager}
      </div>
    </div>
  );
}
