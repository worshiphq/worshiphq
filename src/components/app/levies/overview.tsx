"use client";

import { useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, LayoutTemplate, Plus, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { acceptLevyDrift } from "@/app/actions/levies";
import type { LeviesPageData, RecordView } from "@/lib/levies/view-types";
import { cn } from "@/lib/utils";
import { BusyButton, Empty, STATUS_DOT, dayMonth, ghs, inputCls, useLevyAction } from "./shared";

function Stat({ label, value, sub, tone, icon: Icon }: { label: string; value: string; sub: string; tone?: "danger" | "success"; icon: typeof Clock }) {
  return (
    <div className={cn("card-surface p-4", tone === "danger" && "border-danger/30")}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-muted">{label}</span>
        <span className={cn("grid size-8 place-items-center rounded-lg border", tone === "danger" ? "border-danger/30 bg-danger/10 text-danger" : "border-line bg-surface-2 text-primary-bright")}><Icon className="size-4" /></span>
      </div>
      <div className={cn("mt-2 font-display text-2xl font-bold tabular-nums tracking-tight", tone === "danger" && "text-danger", tone === "success" && "text-success")}>{value}</div>
      <div className="mt-1 text-xs text-ink-muted">{sub}</div>
    </div>
  );
}

/** A ring showing what the church keeps against what goes to levies. */
function KeepRing({ keepPct }: { keepPct: number }) {
  const r = 26, c = 2 * Math.PI * r;
  const levyShare = Math.max(0, Math.min(100, 100 - keepPct));
  return (
    <svg viewBox="0 0 64 64" className="size-16 shrink-0 -rotate-90" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-primary)" strokeWidth="8" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-warning)" strokeWidth="8" strokeDasharray={`${(levyShare / 100) * c} ${c}`} />
    </svg>
  );
}

function DriftBanner({ rec, next, canIgnore }: { rec: RecordView; next: RecordView | undefined; canIgnore: boolean }) {
  const { pending, run } = useLevyAction();
  const [why, setWhy] = useState("");
  const [asking, setAsking] = useState(false);
  const more = rec.drift > 0;
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/10 p-3.5 text-sm">
      <div className="flex gap-2.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p><b>{rec.ruleName}:</b> giving for {rec.label} changed after it was closed. The levy would now be <b>{ghs(Math.abs(rec.drift))} {more ? "more" : "less"}</b>.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <BusyButton size="sm" busy={pending && !asking} busyLabel="Adding..." disabled={!next || pending} onClick={() => run(() => acceptLevyDrift(rec.id, "carry"), (r) => String(r.message))}>
              {next ? `${more ? "Add" : "Take"} ${ghs(Math.abs(rec.drift))} ${more ? "to" : "off"} ${next.label}` : "No open period yet"}
            </BusyButton>
            {canIgnore && !asking && <button type="button" onClick={() => setAsking(true)} className="h-9 rounded-xl px-3 text-sm font-medium text-ink-muted hover:bg-surface-2">Leave {rec.label} as it was</button>}
          </div>
          {asking && (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why? For example, head office agreed" className={`${inputCls} h-9`} />
              <BusyButton size="sm" variant="secondary" busy={pending} busyLabel="Saving..." disabled={why.trim().length < 3} onClick={() => run(() => acceptLevyDrift(rec.id, "ignore", why), (r) => String(r.message), () => setAsking(false))}>Leave it</BusyButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function OverviewView({ data, onTemplates, onAdd, onPay, onJump }: {
  data: LeviesPageData; onTemplates: () => void; onAdd: () => void; onPay: (r: RecordView[]) => void; onJump: (monthKey: string) => void;
}) {
  const { summary: s } = data;
  if (data.rules.length === 0) {
    return (
      <Empty title="Set up your levies" text="Tell WorshipHQ what your church sends to head office, the district or anyone else. It works out each month's amount from your giving, explains every figure, and reminds you before it is due.">
        {data.access.manage && <>
          <button type="button" onClick={onTemplates} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white"><LayoutTemplate className="size-4" /> Start from a template</button>
          <button type="button" onClick={onAdd} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-5 text-sm font-semibold hover:bg-surface-2"><Plus className="size-4" /> Add a levy</button>
        </>}
      </Empty>
    );
  }
  const overdueRecs = data.records.filter((r) => r.overdue);
  const drift = data.records.filter((r) => r.state === "closed" && Math.abs(r.drift) >= 0.01);
  const nextOpen = (r: RecordView) => data.records.filter((x) => x.ruleId === r.ruleId && x.state === "open" && x.startYmd > r.startYmd).sort((a, b) => (a.startYmd < b.startYmd ? -1 : 1))[0];

  return (
    <div className="space-y-4">
      {drift.map((r) => <DriftBanner key={r.id} rec={r} next={nextOpen(r)} canIgnore={data.access.reopen} />)}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Overdue" icon={AlertTriangle} tone={s.overdueCount ? "danger" : undefined} value={s.overdueCount ? ghs(s.overdueTotal) : "None"}
          sub={s.overdueCount ? `${s.overdueCount} period${s.overdueCount === 1 ? "" : "s"} past the due date` : "Nothing is late"} />
        <Stat label="Due next" icon={CalendarClock} value={s.dueNext ? ghs(s.dueNext.total) : "Nothing"} sub={s.dueNext ? `on ${dayMonth(s.dueNext.dueYmd)}` : "Nothing waiting to be paid"} />
        <Stat label={`Paid in ${data.year}`} icon={CheckCircle2} tone="success" value={ghs(s.paidThisYear)} sub={`Owed now: ${ghs(s.owedNow)}`} />
        <div className="card-surface col-span-2 flex items-center gap-3 p-4 lg:col-span-1">
          {s.keepPct !== null ? <KeepRing keepPct={s.keepPct} /> : null}
          <div className="min-w-0">
            <div className="text-sm text-ink-muted">You keep</div>
            <div className="font-display text-2xl font-bold text-primary">{s.keepPct !== null ? `${s.keepPct}%` : "-"}</div>
            <div className="text-xs text-ink-muted">{s.keepPct !== null ? `Of ${ghs(s.incomeThisYear)} income in ${data.year}, ${ghs(s.leviesThisYear)} went to levies.` : `No income recorded in ${data.year} yet.`}</div>
          </div>
        </div>
      </div>

      {overdueRecs.length > 0 && data.access.manage && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm">
          <span className="min-w-0 flex-1"><b>{overdueRecs.length} overdue</b>: {overdueRecs.slice(0, 3).map((r) => `${r.ruleName} ${r.label}`).join(", ")}{overdueRecs.length > 3 ? " and more" : ""}.</span>
          <button type="button" onClick={() => onPay(overdueRecs)} className="shrink-0 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white">Pay {overdueRecs.length > 1 ? "them" : "it"} now</button>
        </div>
      )}

      {data.current.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-[1rem] font-semibold">This period so far</h3>
            <span className="flex items-center gap-1 text-xs text-info"><RefreshCw className="size-3" /> Live</span>
          </div>
          <ul className="mt-3 divide-y divide-line-soft">
            {data.current.map((c) => (
              <li key={c.label} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{c.label}</div>
                  <div className="text-xs text-ink-muted">{c.lines[0]?.text}</div>
                  <div className="mt-0.5 text-[11px] text-ink-faint">Still counting until {dayMonth(c.untilYmd)}. Figures update as giving is recorded.</div>
                </div>
                <div className="shrink-0 font-display text-lg font-bold tabular-nums">{ghs(c.lines[0]?.amount ?? 0)}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <h3 className="font-display text-[1rem] font-semibold">{data.year} at a glance</h3>
        <p className="text-xs text-ink-muted">Tap a month to see its levies.</p>
        <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-12">
          {data.strip.map((m) => (
            <button key={m.key} type="button" onClick={() => onJump(m.key)} title={m.status === "none" ? "No levy" : `${m.label}: due ${ghs(m.due)}, paid ${ghs(m.paid)}`}
              className="flex flex-col items-center gap-1 rounded-lg border border-line px-1 py-2 text-[11px] font-medium hover:bg-surface-2">
              <span className={cn("h-2 w-full rounded-full", STATUS_DOT[m.status])} />
              {m.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
          {([["paid", "Paid"], ["unpaid", "Due"], ["part_paid", "Part paid"], ["overdue", "Overdue"], ["counting", "Still counting"]] as const).map(([k, l]) => (
            <span key={k} className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-full", STATUS_DOT[k])} /> {l}</span>
          ))}
        </div>
      </Card>
    </div>
  );
}
