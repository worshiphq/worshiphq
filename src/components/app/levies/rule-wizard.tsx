"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Percent, Coins, CalendarRange, AlertTriangle, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { previewLevy, saveLevyRule, type RuleDraft } from "@/app/actions/levies";
import { PAYEE_KINDS } from "@/lib/levies/explain";
import type { RuleView, StreamOption } from "@/lib/levies/view-types";
import { cn } from "@/lib/utils";
import { BusyButton, FREQ_LABEL, MONTH_OPTIONS, ghs, ghs0, inputCls, labelCls, selectCls, useLevyAction, dayMonthYear } from "./shared";

const STEPS = [
  { key: "who", label: "Who receives it", icon: Building2 },
  { key: "how", label: "How much", icon: Percent },
  { key: "from", label: "From which income", icon: Coins },
  { key: "when", label: "When", icon: CalendarRange },
] as const;

export function draftFromRule(r: RuleView, todayYmd: string): RuleDraft {
  const v = r.current;
  return {
    id: r.id, name: r.name, payee: r.payee, payeeKind: r.payeeKind, payeeIsParent: !!r.payeeChurchId,
    kind: v?.kind ?? "percent", rate: v?.rate ?? null, fixedAmount: v?.fixedAmount ?? null, allIncome: v?.allIncome ?? false, sources: v?.sources ?? [],
    minAmount: v?.minAmount ?? null, maxAmount: v?.maxAmount ?? null, afterRuleId: r.afterRuleId, frequency: r.frequency, yearStartMonth: r.yearStartMonth,
    dueDays: r.dueDays, startsYmd: r.startsYmd, effectiveFromYmd: todayYmd, notes: r.notes,
  };
}

export function emptyDraft(todayYmd: string): RuleDraft {
  return {
    name: "", payee: "", payeeKind: "hq", payeeIsParent: false, kind: "percent", rate: null, fixedAmount: null, allIncome: false, sources: [],
    minAmount: null, maxAmount: null, afterRuleId: null, frequency: "monthly", yearStartMonth: 1, dueDays: 15, startsYmd: `${todayYmd.slice(0, 8)}01`, notes: null,
  };
}

/** Add or change a levy in four short steps, with a live "last month this would have been" preview the whole way. */
export function RuleWizard({ open, onClose, initial, editing, streams, rules, parentName, todayYmd }: {
  open: boolean; onClose: () => void; initial: RuleDraft; editing: RuleView | null; streams: StreamOption[]; rules: RuleView[];
  parentName: string | null; todayYmd: string;
}) {
  const [d, setD] = useState<RuleDraft>(initial);
  const [step, setStep] = useState(0);
  const { pending, run } = useLevyAction();
  const set = (patch: Partial<RuleDraft>) => setD((p) => ({ ...p, ...patch }));

  // Live preview, a short pause after each change.
  const [rawPreview, setPreview] = useState<{ label: string; total: number; lines: string[]; cap: string | null; warnings: string[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const seq = useRef(0);
  const ready = d.kind === "percent" ? Number(d.rate) > 0 && (d.allIncome || d.sources.length > 0) : Number(d.fixedAmount) > 0;
  const key = JSON.stringify([d.kind, d.rate, d.fixedAmount, d.allIncome, d.sources, d.minAmount, d.maxAmount, d.afterRuleId, d.frequency, d.yearStartMonth]);
  useEffect(() => {
    if (!ready) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setPreviewing(true);
      const r = await previewLevy(d).catch(() => null);
      if (id !== seq.current) return;
      setPreviewing(false);
      if (r && r.ok) setPreview(r);
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  const preview = ready ? rawPreview : null;
  const scheduleLocked = !!editing?.scheduleLocked;
  const afterOptions = rules.filter((r) => r.id !== editing?.id && r.active && !r.afterRuleId && r.current?.kind === "percent" && r.frequency === d.frequency);
  const fixedNote = d.kind === "fixed" && d.startsYmd.slice(8) !== "01" ? "A fixed amount is charged for whole periods, so it will start on the first day of the next period." : null;
  const changingFigures = !!editing && (() => {
    const v = editing.current;
    if (!v) return true;
    return v.kind !== d.kind || (v.rate ?? null) !== (d.kind === "percent" ? Number(d.rate) : null) || (v.fixedAmount ?? null) !== (d.kind === "fixed" ? Number(d.fixedAmount) : null)
      || v.allIncome !== d.allIncome || [...v.sources].sort().join() !== [...d.sources].sort().join() || (v.minAmount ?? null) !== (d.minAmount ?? null) || (v.maxAmount ?? null) !== (d.maxAmount ?? null);
  })();

  const problem = useMemo(() => {
    if (step === 0 && (!d.name.trim() || !d.payee.trim())) return "Give the levy a name and say who receives it.";
    if (step === 1 && d.kind === "percent" && !(Number(d.rate) > 0 && Number(d.rate) <= 100)) return "Enter a percentage above 0 and up to 100.";
    if (step === 1 && d.kind === "fixed" && !(Number(d.fixedAmount) > 0)) return "Enter the fixed amount.";
    if (step === 2 && d.kind === "percent" && !d.allIncome && d.sources.length === 0) return "Tick at least one kind of income.";
    return null;
  }, [step, d]);

  const save = () => run(() => saveLevyRule(d), (r) => String(r.message ?? "Saved."), onClose);
  const toggleSource = (k: string) => set({ sources: d.sources.includes(k) ? d.sources.filter((x) => x !== k) : [...d.sources, k] });

  return (
    <Modal open={open} onClose={onClose} wide title={editing ? `Change ${editing.name}` : "Add a levy"} description="Money your church sends on to someone else, such as head office or the district.">
      {/* Steps */}
      <ol className="mb-5 grid grid-cols-4 gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <button type="button" onClick={() => setStep(i)} className={cn("flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition-colors sm:flex-row sm:justify-center sm:text-xs", i === step ? "bg-primary/10 text-primary" : i < step ? "text-ink" : "text-ink-faint")}>
              <span className={cn("grid size-6 place-items-center rounded-full text-[11px] font-bold", i === step ? "bg-primary text-white" : i < step ? "bg-success/15 text-success" : "bg-surface-2")}>{i + 1}</span>
              <span className="text-center leading-tight">{s.label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <div className="min-h-[300px] space-y-4">
          {step === 0 && (
            <>
              <div>
                <label className={labelCls} htmlFor="lw-name">Name of the levy</label>
                <input id="lw-name" autoFocus value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} placeholder="e.g. Head office tithe share" className={inputCls} />
              </div>
              {parentName && (
                <button type="button" onClick={() => set({ payeeIsParent: !d.payeeIsParent, payee: !d.payeeIsParent ? parentName : d.payee })} className={cn("flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm", d.payeeIsParent ? "border-primary bg-primary/5" : "border-line hover:bg-surface-2")}>
                  <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border", d.payeeIsParent ? "border-primary bg-primary text-white" : "border-line")}>{d.payeeIsParent && "✓"}</span>
                  <span><span className="font-medium">Paid to our main church ({parentName})</span><span className="block text-xs text-ink-muted">If you share levies with them, they see what is due and paid and can confirm they received it.</span></span>
                </button>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="lw-payee">Who receives it</label>
                  <input id="lw-payee" value={d.payee} onChange={(e) => set({ payee: e.target.value })} maxLength={80} placeholder="e.g. Head office" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="lw-kind">Kind</label>
                  <select id="lw-kind" value={d.payeeKind} onChange={(e) => set({ payeeKind: e.target.value })} className={selectCls}>
                    {PAYEE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="lw-notes">Notes (optional)</label>
                <input id="lw-notes" value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} maxLength={500} placeholder="e.g. Agreed at the district meeting, March 2026" className={inputCls} />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {([["percent", "A percentage", "of the income you choose", Percent], ["fixed", "A fixed amount", "the same every period", Coins]] as const).map(([k, t, sub, Icon]) => (
                  <button key={k} type="button" onClick={() => set({ kind: k })} className={cn("rounded-xl border p-3 text-left transition-colors", d.kind === k ? "border-primary bg-primary/5" : "border-line hover:bg-surface-2")}>
                    <Icon className={cn("mb-1.5 size-5", d.kind === k ? "text-primary" : "text-ink-faint")} />
                    <div className="text-sm font-semibold">{t}</div>
                    <div className="text-xs text-ink-muted">{sub}</div>
                  </button>
                ))}
              </div>
              {d.kind === "percent" ? (
                <div>
                  <label className={labelCls} htmlFor="lw-rate">Percentage</label>
                  <div className="relative max-w-[180px]">
                    <input id="lw-rate" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={d.rate ?? ""} onChange={(e) => set({ rate: e.target.value === "" ? null : Number(e.target.value) })} className={`${inputCls} pr-8 text-right text-lg font-semibold`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">%</span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className={labelCls} htmlFor="lw-fixed">Amount each {d.frequency === "monthly" ? "month" : d.frequency === "quarterly" ? "quarter" : "year"}</label>
                  <div className="relative max-w-[220px]">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">₵</span>
                    <input id="lw-fixed" type="number" inputMode="decimal" min="0" step="0.01" value={d.fixedAmount ?? ""} onChange={(e) => set({ fixedAmount: e.target.value === "" ? null : Number(e.target.value) })} className={`${inputCls} pl-7 text-right text-lg font-semibold`} />
                  </div>
                </div>
              )}
              <details className="rounded-xl border border-line p-3 text-sm" open={!!(d.minAmount || d.maxAmount)}>
                <summary className="cursor-pointer font-medium">Limits (optional)</summary>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls} htmlFor="lw-min">Never less than</label>
                    <input id="lw-min" type="number" min="0" step="0.01" value={d.minAmount ?? ""} onChange={(e) => set({ minAmount: e.target.value === "" ? null : Number(e.target.value) })} placeholder="No minimum" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="lw-max">Never more than</label>
                    <input id="lw-max" type="number" min="0" step="0.01" value={d.maxAmount ?? ""} onChange={(e) => set({ maxAmount: e.target.value === "" ? null : Number(e.target.value) })} placeholder="No maximum" className={inputCls} />
                  </div>
                </div>
              </details>
            </>
          )}

          {step === 2 && (
            d.kind === "fixed" ? (
              <p className="rounded-xl bg-surface-2 p-4 text-sm text-ink-muted">A fixed amount does not depend on income. Go on to say when it is due.</p>
            ) : (
              <>
                <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm", d.allIncome ? "border-primary bg-primary/5" : "border-line")}>
                  <input type="checkbox" checked={d.allIncome} onChange={(e) => set({ allIncome: e.target.checked })} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
                  <span><span className="font-medium">All income</span><span className="block text-xs text-ink-muted">Every kind of giving and other income. Transfers between your accounts never count.</span></span>
                </label>
                {!d.allIncome && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-ink-muted">Tick what it is worked out on. Figures are the last 3 full months.</p>
                    <div className="grid max-h-72 gap-1.5 overflow-y-auto sm:grid-cols-2">
                      {streams.map((s) => (
                        <label key={s.key} className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm", d.sources.includes(s.key) ? "border-primary bg-primary/5" : "border-line hover:bg-surface-2")}>
                          <input type="checkbox" checked={d.sources.includes(s.key)} onChange={() => toggleSource(s.key)} className="size-4 accent-[var(--color-primary)]" />
                          <span className="min-w-0 flex-1 truncate font-medium">{s.label}</span>
                          <span className="shrink-0 text-xs tabular-nums text-ink-faint">{s.last3 ? ghs0(s.last3) : "none yet"}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {afterOptions.length > 0 && (
                  <details className="rounded-xl border border-line p-3 text-sm" open={!!d.afterRuleId}>
                    <summary className="cursor-pointer font-medium">Advanced: work it out on what is left after another levy</summary>
                    <select value={d.afterRuleId ?? ""} onChange={(e) => set({ afterRuleId: e.target.value || null })} className={`${selectCls} mt-3`} disabled={scheduleLocked}>
                      <option value="">No, use the full income</option>
                      {afterOptions.map((r) => <option key={r.id} value={r.id}>After {r.name} ({r.current?.summary})</option>)}
                    </select>
                  </details>
                )}
              </>
            )
          )}

          {step === 3 && (
            <>
              {scheduleLocked && (
                <p className="flex gap-2 rounded-xl bg-surface-2 p-3 text-xs text-ink-muted"><AlertTriangle className="size-4 shrink-0 text-warning" /> A period of this levy is paid or closed, so how often and the start date stay as they are. To change them, archive this levy and add a new one.</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className={labelCls}>How often</span>
                  <div className="flex gap-1.5">
                    {(["monthly", "quarterly", "yearly"] as const).map((f) => (
                      <button key={f} type="button" disabled={scheduleLocked} onClick={() => set({ frequency: f, afterRuleId: null })} className={cn("flex-1 rounded-lg border px-2 py-2 text-sm font-medium disabled:opacity-60", d.frequency === f ? "border-primary bg-primary text-white" : "border-line text-ink-muted hover:bg-surface-2")}>{FREQ_LABEL[f]}</button>
                    ))}
                  </div>
                </div>
                {d.frequency !== "monthly" && (
                  <div>
                    <label className={labelCls} htmlFor="lw-ysm">Financial year starts in</label>
                    <select id="lw-ysm" disabled={scheduleLocked} value={d.yearStartMonth} onChange={(e) => set({ yearStartMonth: Number(e.target.value) })} className={selectCls}>
                      {MONTH_OPTIONS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className={labelCls} htmlFor="lw-due">Due how many days after each period ends</label>
                  <input id="lw-due" type="number" min="0" max="120" value={d.dueDays} onChange={(e) => set({ dueDays: Math.max(0, Math.min(120, Number(e.target.value) || 0)) })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="lw-start">Starts counting from</label>
                  <input id="lw-start" type="date" disabled={scheduleLocked} value={d.startsYmd} onChange={(e) => set({ startsYmd: e.target.value })} className={inputCls} />
                </div>
                {editing && changingFigures && (
                  <div className="sm:col-span-2">
                    <label className={labelCls} htmlFor="lw-eff">New figures apply from</label>
                    <input id="lw-eff" type="date" value={d.effectiveFromYmd ?? todayYmd} onChange={(e) => set({ effectiveFromYmd: e.target.value })} className={`${inputCls} max-w-[220px]`} />
                    <p className="mt-1 text-xs text-ink-muted">Income before this date keeps the old figures. Closed periods are never changed; a date inside one is refused.</p>
                  </div>
                )}
              </div>
              {fixedNote && <p className="rounded-xl bg-info/10 p-3 text-xs text-info">{fixedNote}</p>}
              <p className="text-xs text-ink-muted">
                {FREQ_LABEL[d.frequency]}, due {d.dueDays} day{d.dueDays === 1 ? "" : "s"} after each {d.frequency === "monthly" ? "month" : d.frequency === "quarterly" ? "quarter" : "year"} ends, counting from {dayMonthYear(d.startsYmd || todayYmd)}.
              </p>
            </>
          )}
        </div>

        {/* Live preview */}
        <aside className="h-fit rounded-2xl border border-primary/20 bg-primary/5 p-4 lg:sticky lg:top-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary"><Sparkles className="size-3.5" /> Preview</div>
          {!ready ? (
            <p className="mt-2 text-sm text-ink-muted">Fill in how much and from which income to see what it comes to.</p>
          ) : previewing && !preview ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted"><Spinner size="sm" /> Working it out...</p>
          ) : preview ? (
            <div className={cn("mt-2 transition-opacity", previewing && "opacity-60")}>
              <div className="text-xs text-ink-muted">{preview.label} this would have been</div>
              <div className="font-display text-2xl font-bold tabular-nums">{ghs(preview.total)}</div>
              <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                {preview.lines.map((l, i) => <li key={i}>{l}</li>)}
                {preview.cap && <li className="text-warning">{preview.cap}</li>}
                {preview.warnings.map((w, i) => <li key={`w${i}`} className="text-warning">{w}</li>)}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>

      {problem && step < 3 && <p className="mt-3 text-xs text-ink-faint">{problem}</p>}
      <div className="mt-5 flex items-center justify-between gap-2 border-t border-line pt-4">
        <button type="button" onClick={() => (step === 0 ? onClose() : setStep(step - 1))} className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink-muted hover:bg-surface-2">
          <ArrowLeft className="size-4" /> {step === 0 ? "Cancel" : "Back"}
        </button>
        {step < 3 ? (
          <button type="button" disabled={!!problem} onClick={() => setStep(step + 1)} className="flex h-11 items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50">
            Next <ArrowRight className="size-4" />
          </button>
        ) : (
          <BusyButton busy={pending} busyLabel="Saving levy..." onClick={save} disabled={!d.name.trim() || !d.payee.trim() || !ready}>
            {editing ? "Save changes" : "Save levy"}
          </BusyButton>
        )}
      </div>
    </Modal>
  );
}
