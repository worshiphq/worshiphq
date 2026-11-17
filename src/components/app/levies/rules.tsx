"use client";

import { useState } from "react";
import { Archive, History, LayoutTemplate, Pencil, Plus, RotateCcw, Trash2, Link2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { archiveLevyRule, deleteLevyRule, restoreLevyRule } from "@/app/actions/levies";
import type { LeviesPageData, RuleView } from "@/lib/levies/view-types";
import { cn } from "@/lib/utils";
import { BusyButton, FREQ_LABEL, dayMonthYear, inputCls, useLevyAction } from "./shared";

function RuleCard({ rule, data, onEdit }: { rule: RuleView; data: LeviesPageData; onEdit: () => void }) {
  const { pending, run } = useLevyAction();
  const [busy, setBusy] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [lastDay, setLastDay] = useState(data.todayYmd);
  const [showHistory, setShowHistory] = useState(false);
  const v = rule.current;
  const history = data.changes.filter((c) => c.ruleId === rule.id);
  const go = (k: string, fn: Parameters<typeof run>[0], msg: string, after?: () => void) => { setBusy(k); run(fn, msg, after); };

  return (
    <Card className={cn("p-5", !rule.active && "opacity-75")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[1rem] font-semibold">{rule.name}</h3>
            {!rule.active && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-muted">Archived{rule.endsYmd ? ` after ${dayMonthYear(rule.endsYmd)}` : ""}</span>}
            {rule.payeeChurchId && <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"><Link2 className="size-3" /> Main church</span>}
          </div>
          <div className="text-sm text-ink-muted">To {rule.payee}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-xl font-bold text-primary">{v?.kind === "percent" ? `${v.rate}%` : v ? `GH₵${v.fixedAmount?.toLocaleString("en-GH", { minimumFractionDigits: 2 })}` : "-"}</div>
          <div className="text-[11px] text-ink-faint">{FREQ_LABEL[rule.frequency]}</div>
        </div>
      </div>
      {v?.kind === "percent" && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {v.allIncome ? <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium">All income</span>
            : v.sourceLabels.map((l) => <span key={l} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium">{l}</span>)}
          {rule.afterName && <span className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted">after {rule.afterName}</span>}
        </div>
      )}
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs text-ink-muted sm:grid-cols-2">
        <div>{rule.dueText}</div>
        <div>Counting since {dayMonthYear(rule.startsYmd)}</div>
        {(v?.minAmount || v?.maxAmount) && <div>{v?.minAmount ? `Never less than GH₵${v.minAmount}` : ""}{v?.minAmount && v?.maxAmount ? ", " : ""}{v?.maxAmount ? `never more than GH₵${v.maxAmount}` : ""}</div>}
        {rule.versions.length > 1 && <div>{rule.versions.length} versions of the figures</div>}
        {rule.notes && <div className="sm:col-span-2">{rule.notes}</div>}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line-soft pt-3">
        {data.access.manage && rule.active && <button type="button" onClick={onEdit} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-surface-2"><Pencil className="size-4" /> Edit</button>}
        <button type="button" onClick={() => setShowHistory(!showHistory)} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink-muted hover:bg-surface-2"><History className="size-4" /> See changes ({history.length})</button>
        {data.access.manage && rule.active && <button type="button" onClick={() => setArchiving(!archiving)} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink-muted hover:bg-surface-2"><Archive className="size-4" /> Archive</button>}
        {data.access.manage && !rule.active && (
          <BusyButton size="sm" variant="secondary" busy={pending && busy === "restore"} busyLabel="Restoring..." onClick={() => go("restore", () => restoreLevyRule(rule.id), `${rule.name} is counting again.`)}><RotateCcw /> Restore</BusyButton>
        )}
        {data.access.del && !rule.hasPayments && !rule.scheduleLocked && (
          <BusyButton size="sm" variant="ghost" className="ml-auto text-danger" busy={pending && busy === "delete"} busyLabel="Deleting..."
            onClick={() => { if (window.confirm(`Delete ${rule.name}? Nothing has been paid or closed on it, so nothing is lost.`)) go("delete", () => deleteLevyRule(rule.id), `${rule.name} deleted.`); }}><Trash2 /> Delete</BusyButton>
        )}
      </div>
      {archiving && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl bg-surface-2 p-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-xs text-ink-muted">Last day this levy counts. Its history and payments stay.</span>
            <input type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} className={inputCls} />
          </label>
          <BusyButton busy={pending && busy === "archive"} busyLabel="Archiving..." onClick={() => go("archive", () => archiveLevyRule(rule.id, lastDay), `${rule.name} archived.`, () => setArchiving(false))}>Archive</BusyButton>
        </div>
      )}
      {showHistory && (
        <ul className="mt-3 space-y-1.5 rounded-xl bg-surface-2 p-3 text-xs text-ink-muted">
          {history.length === 0 ? <li>No changes yet.</li> : history.map((c) => <li key={c.id}><span className="text-ink-faint">{dayMonthYear(c.createdAt.slice(0, 10))}{c.byName ? `, ${c.byName}` : ""}:</span> {c.summary}</li>)}
          {rule.versions.length > 0 && <li className="pt-1 text-ink-faint">Figures over time: {rule.versions.map((x) => `${x.summary} from ${dayMonthYear(x.fromYmd)}`).join("; ")}.</li>}
        </ul>
      )}
    </Card>
  );
}

export function RulesView({ data, onAdd, onEdit, onTemplates }: { data: LeviesPageData; onAdd: () => void; onEdit: (r: RuleView) => void; onTemplates: () => void }) {
  return (
    <div className="space-y-4">
      {data.access.manage && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onAdd} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"><Plus className="size-4" /> Add a levy</button>
          <button type="button" onClick={onTemplates} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:bg-surface-2"><LayoutTemplate className="size-4" /> From a template</button>
        </div>
      )}

      {data.retention.length > 0 && (
        <Card className="p-5">
          <h3 className="font-display text-[1rem] font-semibold">Levy share by income type</h3>
          <p className="text-xs text-ink-muted">Out of every cedi of each kind of income, what goes to levies and what your church keeps.</p>
          <div className="mt-3 space-y-3">
            {data.retention.map((r) => (
              <div key={r.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{r.label}</span>
                  <span className="text-xs text-ink-muted">Levies {r.totalPct}%, <b className="text-primary">you keep {r.keepPct}%</b></span>
                </div>
                <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-primary/15">
                  {r.shares.map((s, i) => <div key={s.name} title={`${s.name}: ${s.pct}%`} className={cn("h-full", i % 2 ? "bg-warning/60" : "bg-warning")} style={{ width: `${Math.min(100, s.pct)}%` }} />)}
                </div>
                <div className="mt-1 text-[11px] text-ink-faint">{r.shares.map((s) => `${s.name} ${s.pct}%`).join(" · ")}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {data.rules.map((r) => <RuleCard key={r.id} rule={r} data={data} onEdit={() => onEdit(r)} />)}
      </div>
    </div>
  );
}
