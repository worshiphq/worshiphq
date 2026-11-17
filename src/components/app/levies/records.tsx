"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, ChevronRight, Paperclip, RefreshCw, Search, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useServerList } from "@/components/ui/use-server-list";
import { recalculateLevies, searchLevyPayments } from "@/app/actions/levies";
import { METHOD_LABELS } from "@/lib/levies/explain";
import type { LeviesPageData, PaymentView, RecordView } from "@/lib/levies/view-types";
import { cn } from "@/lib/utils";
import { BusyButton, StatusBadge, dayMonth, dayMonthYear, ghs, inputCls, selectCls, useLevyAction } from "./shared";

type Filter = "all" | "owing" | "overdue" | "paid";

export function RecordsView({ data, focusMonth, onOpen, onPay }: {
  data: LeviesPageData; focusMonth: string | null; onOpen: (r: RecordView) => void; onPay: (r: RecordView[]) => void;
}) {
  const { pending, run } = useLevyAction();
  const [filter, setFilter] = useState<Filter>("all");
  const [ruleId, setRuleId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const shown = useMemo(() => data.records.filter((r) => {
    if (ruleId && r.ruleId !== ruleId) return false;
    if (focusMonth && !(r.startYmd.slice(0, 7) <= focusMonth && r.endYmd > `${focusMonth}-01`)) return false;
    if (filter === "owing") return r.left > 0 && r.status !== "counting";
    if (filter === "overdue") return r.overdue;
    if (filter === "paid") return r.status === "paid" || r.status === "credit" || r.status === "waived" || r.status === "nothing_due";
    return true;
  }), [data.records, filter, ruleId, focusMonth]);

  // Group by the period's first month, newest first.
  const groups = useMemo(() => {
    const m = new Map<string, RecordView[]>();
    for (const r of shown) m.set(r.label, [...(m.get(r.label) ?? []), r]);
    return [...m.entries()];
  }, [shown]);

  const pickable = (r: RecordView) => data.access.manage && r.left > 0 && r.status !== "counting";
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickedRecs = data.records.filter((r) => picked.has(r.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-xl bg-surface-2 p-1">
          {([["all", "All"], ["owing", "Still owing"], ["overdue", "Overdue"], ["paid", "Paid"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", filter === k ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>{l}</button>
          ))}
        </div>
        {data.rules.length > 1 && (
          <select value={ruleId} onChange={(e) => setRuleId(e.target.value)} className={`${selectCls} h-9 w-auto`} aria-label="Levy">
            <option value="">Every levy</option>
            {data.rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
        {focusMonth && <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{dayMonthYear(`${focusMonth}-01`).replace(/^1 /, "")}</span>}
        {data.access.manage && (
          <BusyButton className="ml-auto" size="sm" variant="secondary" busy={pending} busyLabel="Recalculating..."
            onClick={() => run(() => recalculateLevies(data.year), (r) => `Recalculated ${r.checked} open period${r.checked === 1 ? "" : "s"}${r.changed ? `, ${r.changed} changed` : ""}. Nothing closed was changed.`)}>
            <RefreshCw /> Recalculate open periods
          </BusyButton>
        )}
      </div>

      {picked.size > 0 && (
        <div className="sticky top-2 z-10 flex items-center gap-3 rounded-xl border border-primary/30 bg-surface p-3 text-sm shadow-lg">
          <span className="min-w-0 flex-1"><b>{picked.size}</b> selected, {ghs(pickedRecs.reduce((t, r) => t + r.left, 0))} to pay</span>
          <button type="button" onClick={() => setPicked(new Set())} className="text-xs text-ink-muted hover:underline">Clear</button>
          <button type="button" onClick={() => { onPay(pickedRecs); setPicked(new Set()); }} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">Pay several</button>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-ink-muted">No levy periods match.</p>
      ) : groups.map(([label, recs]) => (
        <section key={label}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</h3>
          <div className="space-y-2">
            {recs.map((r) => (
              <Card key={r.id} className={cn("p-0", r.overdue && "border-danger/30")}>
                <div className="flex items-start gap-3 p-4">
                  {pickable(r) ? (
                    <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.ruleName} ${r.label}`} className="mt-1 size-4 accent-[var(--color-primary)]" />
                  ) : <span className="w-4" />}
                  <button type="button" onClick={() => onOpen(r)} className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{r.ruleName}</span>
                      <StatusBadge status={r.status} text={r.statusText} closed={r.state === "closed"} />
                    </div>
                    <div className="mt-0.5 text-xs text-ink-muted">To {r.payee}</div>
                    <div className="mt-1.5 line-clamp-2 text-sm text-ink-muted">{r.explanation.join(". ")}</div>
                  </button>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-ink-faint" />
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line-soft px-4 py-2.5 pl-11 text-sm">
                  <span><span className="text-ink-faint">Due </span><b className="tabular-nums">{ghs(r.due)}</b></span>
                  <span><span className="text-ink-faint">Paid </span><span className="tabular-nums">{ghs(r.paid)}</span></span>
                  <span><span className="text-ink-faint">Left </span><b className={cn("tabular-nums", r.left > 0 && (r.overdue ? "text-danger" : "text-warning"))}>{ghs(r.left)}</b></span>
                  <span className="text-xs text-ink-faint">Due {dayMonth(r.dueYmd)}</span>
                  {data.access.manage && r.left > 0 && r.status !== "counting" && (
                    <button type="button" onClick={() => onPay([r])} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"><Wallet className="size-3.5" /> Record payment</button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <PaymentsList data={data} />
    </div>
  );
}

/** Every payment, searchable, newest first. */
function PaymentsList({ data }: { data: LeviesPageData }) {
  const [q, setQ] = useState("");
  const [ruleId, setRuleId] = useState("");
  const list = useServerList<PaymentView, { ruleId?: string; year?: number }>({
    initial: data.payments, query: q, filters: { ruleId: ruleId || undefined }, fetchPage: searchLevyPayments, pageSize: 25,
  });
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[1rem] font-semibold">Payments</h3>
        <span className="text-xs text-ink-muted">{list.total} recorded</span>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by reference, levy or who receives it" className={`${inputCls} pl-9`} />
          {list.spinner}
        </div>
        {data.rules.length > 1 && (
          <select value={ruleId} onChange={(e) => setRuleId(e.target.value)} className={`${selectCls} sm:w-56`} aria-label="Levy">
            <option value="">Every levy</option>
            {data.rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
      </div>
      {list.rows.length === 0 ? <p className="mt-4 text-sm text-ink-muted">No payments yet.</p> : (
        <ul className="mt-3 divide-y divide-line-soft">
          {list.rows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
              <span className="w-24 shrink-0 text-ink-muted">{dayMonthYear(p.paidOnYmd)}</span>
              <span className="min-w-0 flex-1"><span className="font-medium">{p.ruleName}</span> <span className="text-ink-muted">{p.periodLabel}</span>
                <span className="block text-xs text-ink-faint">{METHOD_LABELS[p.method] ?? p.method}{p.reference ? `, ref ${p.reference}` : ""}{p.recordedByName ? `, by ${p.recordedByName}` : ""}</span>
              </span>
              {p.confirmedBy && <span title={`Confirmed by ${p.confirmedBy}`} className="flex items-center gap-1 text-xs text-success"><BadgeCheck className="size-3.5" /> Confirmed</span>}
              {p.hasProof && <a href={`/api/levies/proof/${p.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary-bright hover:underline"><Paperclip className="size-3.5" /> {p.proofType === "application/pdf" ? "PDF" : "Photo"}</a>}
              <span className="w-28 shrink-0 text-right font-semibold tabular-nums">{ghs(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {list.pager}
    </Card>
  );
}
