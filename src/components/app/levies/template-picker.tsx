"use client";

import { useState } from "react";
import { Info, LayoutTemplate } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { applyLevyTemplates, type RuleDraft } from "@/app/actions/levies";
import { LEVY_TEMPLATES, TEMPLATE_SETS, TEMPLATE_NOTE, type SourceHint } from "@/lib/levies/templates";
import type { ScheduleItem, StreamOption } from "@/lib/levies/view-types";
import { cn } from "@/lib/utils";
import { BusyButton, FREQ_LABEL, ghs0, inputCls, useLevyAction } from "./shared";

interface Item {
  key: string; name: string; payee: string; payeeKind: string; kind: "percent" | "fixed"; rate: number | null; fixedAmount: number | null;
  placeholder?: string; frequency: "monthly" | "quarterly" | "yearly"; dueDays: number; sourceHint: SourceHint; blurb: string;
}

function hintSources(hint: SourceHint, streams: StreamOption[]): { allIncome: boolean; sources: string[] } {
  if (hint === "all") return { allIncome: true, sources: [] };
  const want = hint === "tithes" ? ["tithes"] : hint === "offertory" ? ["offertory"] : hint === "tithes_offertory" ? ["tithes", "offertory"] : [];
  return { allIncome: false, sources: streams.filter((s) => want.includes(s.kind)).map((s) => s.key) };
}

/**
 * Start from a ready-made set (generic examples) or from the main church's suggested levies. Every figure and every
 * income tick is shown and editable before anything is saved.
 */
export function TemplatePicker({ open, onClose, streams, todayYmd, parent }: {
  open: boolean; onClose: () => void; streams: StreamOption[]; todayYmd: string;
  /** When set, the items are the main church's suggestions and every levy is paid to it. */
  parent?: { name: string; schedule: ScheduleItem[] } | null;
}) {
  const { pending, run } = useLevyAction();
  const fromParent = !!parent;
  const parentItems: Item[] = (parent?.schedule ?? []).map((s, i) => ({ key: `p${i}`, name: s.name, payee: parent!.name, payeeKind: "hq", kind: s.kind, rate: s.rate, fixedAmount: s.fixedAmount, frequency: s.frequency, dueDays: s.dueDays, sourceHint: s.sourceHint, blurb: s.note ?? "" }));
  const [setKey, setSetKey] = useState<string | null>(fromParent ? "parent" : null);
  const items: Item[] = fromParent ? parentItems : (TEMPLATE_SETS.find((s) => s.key === setKey)?.templates ?? []).map((k) => LEVY_TEMPLATES.find((t) => t.key === k)!).filter(Boolean);

  const [drafts, setDrafts] = useState<Record<string, RuleDraft & { on: boolean }>>({});
  const draftFor = (it: Item): RuleDraft & { on: boolean } => drafts[it.key] ?? {
    on: true, name: it.name, payee: it.payee, payeeKind: it.payeeKind, payeeIsParent: fromParent, kind: it.kind, rate: it.rate, fixedAmount: it.fixedAmount,
    ...hintSources(it.sourceHint, streams), minAmount: null, maxAmount: null, afterRuleId: null, frequency: it.frequency, yearStartMonth: 1,
    dueDays: it.dueDays, startsYmd: `${todayYmd.slice(0, 8)}01`, templateKey: fromParent ? "parent-schedule" : it.key, notes: null,
  };
  const update = (it: Item, patch: Partial<RuleDraft & { on: boolean }>) => setDrafts((p) => ({ ...p, [it.key]: { ...draftFor(it), ...patch } }));

  const chosen = items.map(draftFor).filter((d) => d.on);
  const save = () => run(() => applyLevyTemplates(chosen.map((x) => { const r: RuleDraft & { on?: boolean } = { ...x }; delete r.on; return r as RuleDraft; }), fromParent ? "parent" : "template"), (r) => `${r.created} levy${r.created === 1 ? "" : "ies"} added. Change any of them in Rules.`, onClose);

  return (
    <Modal open={open} onClose={onClose} wide title={fromParent ? `Suggested by ${parent!.name}` : "Start from a template"} description={fromParent ? "Your main church suggests these levies. Review each one, then add it as your own." : TEMPLATE_NOTE}>
      {!fromParent && (
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {TEMPLATE_SETS.map((s) => (
            <button key={s.key} type="button" onClick={() => { setSetKey(s.key); setDrafts({}); }} className={cn("rounded-xl border p-3 text-left transition-colors", setKey === s.key ? "border-primary bg-primary/5" : "border-line hover:bg-surface-2")}>
              <LayoutTemplate className={cn("mb-1 size-4", setKey === s.key ? "text-primary" : "text-ink-faint")} />
              <div className="text-sm font-semibold">{s.name}</div>
              <div className="text-xs text-ink-muted">{s.blurb}</div>
            </button>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          <p className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning"><Info className="size-4 shrink-0" /> {fromParent ? "These are your main church's suggestions. Check them against what you have agreed." : "Example rates only. Change them to match what your church actually pays."}</p>
          {items.map((it) => {
            const d = draftFor(it);
            return (
              <div key={it.key} className={cn("rounded-xl border p-3", d.on ? "border-line" : "border-line opacity-60")}>
                <label className="flex items-start gap-2.5">
                  <input type="checkbox" checked={d.on} onChange={(e) => update(it, { on: e.target.checked })} className="mt-1 size-4 accent-[var(--color-primary)]" />
                  <span className="min-w-0 flex-1">
                    <input value={d.name} onChange={(e) => update(it, { name: e.target.value })} className="w-full bg-transparent text-sm font-semibold outline-none" aria-label="Levy name" />
                    <span className="block text-xs text-ink-muted">{it.blurb ? `${it.blurb} ` : ""}{FREQ_LABEL[it.frequency]}, due {it.dueDays} days after each period.</span>
                  </span>
                </label>
                {d.on && (
                  <div className="mt-3 grid gap-2 pl-6 sm:grid-cols-[140px_1fr]">
                    {d.kind === "percent" ? (
                      <div className="relative">
                        <input type="number" inputMode="decimal" min="0" max="100" step="0.01" value={d.rate ?? ""} onChange={(e) => update(it, { rate: e.target.value === "" ? null : Number(e.target.value) })} className={`${inputCls} pr-8 text-right`} aria-label="Percentage" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">%</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">₵</span>
                        <input type="number" inputMode="decimal" min="0" step="0.01" value={d.fixedAmount ?? ""} placeholder={it.placeholder ?? "Amount"} onChange={(e) => update(it, { fixedAmount: e.target.value === "" ? null : Number(e.target.value) })} className={`${inputCls} pl-7 text-right`} aria-label="Amount" />
                      </div>
                    )}
                    {d.kind === "percent" ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-ink-muted">of</span>
                        {streams.filter((s) => s.key.startsWith("fund:")).slice(0, 10).map((s) => (
                          <button key={s.key} type="button" onClick={() => update(it, { allIncome: false, sources: d.sources.includes(s.key) ? d.sources.filter((x) => x !== s.key) : [...d.sources, s.key] })}
                            className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", d.sources.includes(s.key) && !d.allIncome ? "border-primary bg-primary text-white" : "border-line text-ink-muted hover:bg-surface-2")}>
                            {s.label}{s.last3 ? ` · ${ghs0(s.last3)}` : ""}
                          </button>
                        ))}
                        {d.sources.length === 0 && !d.allIncome && <span className="text-xs text-danger">Tick at least one</span>}
                      </div>
                    ) : <span className="self-center text-xs text-ink-muted">The same amount every period, whatever came in.</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-5 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-medium text-ink-muted hover:bg-surface-2">Cancel</button>
        <BusyButton busy={pending} busyLabel="Adding levies..." onClick={save} disabled={!chosen.length || chosen.some((d) => (d.kind === "percent" ? !(Number(d.rate) > 0) || (!d.allIncome && !d.sources.length) : !(Number(d.fixedAmount) > 0)))}>
          Add {chosen.length || ""} lev{chosen.length === 1 ? "y" : "ies"}
        </BusyButton>
      </div>
    </Modal>
  );
}
