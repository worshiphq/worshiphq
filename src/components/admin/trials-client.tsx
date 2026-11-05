"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "@/components/ui/app-link";
import { Loader2, Search, Sparkles } from "lucide-react";
import { AdminCard } from "@/components/admin/admin-shell";
import { useFeedback } from "@/components/ui/feedback";
import {
  saveTrialSettingsAction, grantTrial, extendTrialAction, endTrialAction, grantTrialBulk, extendTrialBulk, endTrialBulk, resetTrialAction, resetTrialBulk,
} from "@/app/actions/admin-trials";
import { TRIAL_STEPS, MAX_TRIAL_DAYS, type TrialSettings, type TrialStep } from "@/lib/trial-settings";
import type { TrialRow, TrialFilter, TrialSort } from "@/lib/data/admin-trials";
import { cn } from "@/lib/utils";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${btn} bg-teal-500 text-slate-950 hover:bg-teal-400`;
const ghost = `${btn} border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10`;
const input = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500/60 focus:outline-none";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const TABS: { key: TrialFilter; label: string }[] = [
  { key: "all", label: "All churches" }, { key: "eligible", label: "Can start one" }, { key: "active", label: "On a trial" },
  { key: "ended", label: "Ended, not upgraded" }, { key: "converted", label: "Upgraded" },
];
const SORTS: { key: TrialSort; label: string }[] = [
  { key: "status", label: "By trial status" }, { key: "members-desc", label: "Most members first" }, { key: "members-asc", label: "Fewest members first" }, { key: "name", label: "Name A to Z" },
];

export type StepFeature = { key: string; label: string };

type Result = { ok: true; message: string } | { ok: false; error: string };

export function TrialsClient({ settings, rows, counts, conversionPct, filter, q, sort, allIds, stepFeatures }: {
  settings: TrialSettings; rows: TrialRow[]; counts: Record<TrialFilter, number>; conversionPct: number | null; filter: TrialFilter; q: string; sort: TrialSort; allIds: string[];
  /** For each step, the features it adds over the plan below, so SuperAdmin can hold some back. */
  stepFeatures: Record<TrialStep, StepFeature[]>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<TrialSettings>(settings);
  const [search, setSearch] = useState(q);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const lastIdx = useRef<number | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const go = (next: { filter?: TrialFilter; q?: string; sort?: TrialSort }) => {
    const sp = new URLSearchParams();
    const f = next.filter ?? filter;
    const query = next.q ?? q;
    const s = next.sort ?? sort;
    if (f !== "all") sp.set("filter", f);
    if (query) sp.set("q", query);
    if (s !== "status") sp.set("sort", s);
    router.push(`${pathname}${sp.toString() ? `?${sp}` : ""}`);
  };

  const run = (key: string, fn: () => Promise<Result>, after?: () => void) => {
    setBusy(key);
    start(async () => {
      const res = await fn();
      setBusy(null);
      toast(res.ok ? res.message : res.error, res.ok ? "success" : "error");
      if (res.ok) { after?.(); router.refresh(); }
    });
  };

  // Ticking: a click ticks one church; shift-click ticks everything between this one and the last one clicked.
  const tick = (idx: number, shift: boolean) => {
    setSel((prev) => {
      const next = new Set(prev);
      const id = rows[idx].churchId;
      if (shift && lastIdx.current !== null) {
        const [a, b] = [Math.min(lastIdx.current, idx), Math.max(lastIdx.current, idx)];
        const turnOn = !prev.has(id);
        for (let i = a; i <= b; i++) { if (turnOn) next.add(rows[i].churchId); else next.delete(rows[i].churchId); }
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastIdx.current = idx;
  };
  const pageAllOn = rows.length > 0 && rows.every((r) => sel.has(r.churchId));
  const togglePage = () => setSel((prev) => { const n = new Set(prev); for (const r of rows) { if (pageAllOn) n.delete(r.churchId); else n.add(r.churchId); } return n; });
  const chosen = [...sel];
  const bulk = (key: string, fn: (ids: string[]) => Promise<Result>) => run(key, () => fn(chosen), () => setSel(new Set()));

  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight"><Sparkles className="size-5 text-teal-400" /> Free trials</h1>
        <p className="mt-1 text-sm text-slate-400">A church can try the plan above theirs for a few days: Free tries Starter, Starter tries Pro, Pro tries Max. When the days run out they drop back and have to upgrade to keep the extras. Invite them from Outreach.</p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Can start a trial" value={counts.eligible} />
        <Stat label="On a trial now" value={counts.active} />
        <Stat label="Upgraded after a trial" value={counts.converted} />
        <Stat label="Trial to paid" value={conversionPct === null ? "-" : `${conversionPct}%`} hint="of trials that have finished" />
      </div>

      <AdminCard className="mb-6 p-5">
        <div className="mb-3 text-sm font-semibold text-slate-200">Trial rules</div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} className="mt-1 size-4 accent-teal-500" />
            <span><span className="font-medium text-slate-200">Trials are on</span><span className="block text-xs text-slate-500">Off stops new trials. Running ones carry on to their end date.</span></span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-200">Days per trial</span>
            <input type="number" min={1} max={MAX_TRIAL_DAYS} value={draft.days} onChange={(e) => setDraft({ ...draft, days: Math.max(1, Math.min(MAX_TRIAL_DAYS, Number(e.target.value) || 1)) })} className={`${input} mt-1 w-24`} />
          </label>
          <div className="text-sm">
            <span className="font-medium text-slate-200">Which upgrades can be tried</span>
            <div className="mt-1 flex flex-wrap gap-3">
              {TRIAL_STEPS.map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-slate-300">
                  <input type="checkbox" checked={draft.steps[s]} onChange={(e) => setDraft({ ...draft, steps: { ...draft.steps, [s]: e.target.checked } })} className="size-4 accent-teal-500" /> {cap(s)}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Which features each trial gives. Ticked = held back (stays locked during the trial). */}
        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="text-sm font-semibold text-slate-200">Features each trial holds back</div>
          <p className="mt-1 text-xs text-slate-500">A trial gives everything the next plan adds, except what you tick here. Ticked features stay locked during the trial and only come with the paid plan.</p>
          <div className="mt-3 space-y-2">
            {TRIAL_STEPS.map((s) => {
              const feats = stepFeatures[s] ?? [];
              const held = draft.hold[s];
              return (
                <details key={s} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <summary className="cursor-pointer text-sm text-slate-200">
                    {cap(s)} trial <span className="text-xs text-slate-500">- gives {feats.length - held.filter((h) => feats.some((f) => f.key === h)).length} of {feats.length} features{held.length ? `, holds back ${held.filter((h) => feats.some((f) => f.key === h)).length}` : ""}</span>
                  </summary>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <button type="button" className={ghost} onClick={() => setDraft({ ...draft, hold: { ...draft.hold, [s]: [] } })}>Give all</button>
                    <button type="button" className={ghost} onClick={() => setDraft({ ...draft, hold: { ...draft.hold, [s]: feats.map((f) => f.key) } })}>Hold all back</button>
                  </div>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                    {feats.map((f) => (
                      <label key={f.key} className="flex items-center gap-2 text-sm text-slate-300">
                        <input type="checkbox" className="size-4 accent-amber-500" checked={held.includes(f.key)}
                          onChange={(e) => setDraft({ ...draft, hold: { ...draft.hold, [s]: e.target.checked ? [...held, f.key] : held.filter((x) => x !== f.key) } })} />
                        <span>{f.label}</span>
                        {held.includes(f.key) && <span className="text-[10px] text-amber-300">held back</span>}
                      </label>
                    ))}
                    {feats.length === 0 && <span className="text-xs text-slate-500">This plan adds no features over the one below it.</span>}
                  </div>
                </details>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button className={primary} disabled={!dirty || pending} onClick={() => run("settings", () => saveTrialSettingsAction(draft))}>
            {busy === "settings" ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save rules"}
          </button>
          {dirty && <span className="text-xs text-amber-300">Unsaved changes</span>}
        </div>
      </AdminCard>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form className="relative" onSubmit={(e) => { e.preventDefault(); go({ q: search.trim() }); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input className={`${input} w-64 pl-9`} placeholder="Search church (press Enter)" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => go({ filter: t.key })} className={cn("rounded-full border px-3 py-1 text-xs", filter === t.key ? "border-teal-500/60 bg-teal-500/15 text-teal-300" : "border-white/10 text-slate-400 hover:bg-white/5")}>
            {t.label} <span className="text-slate-500">{counts[t.key]}</span>
          </button>
        ))}
        <select value={sort} onChange={(e) => go({ sort: e.target.value as TrialSort })} className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs text-slate-200" aria-label="Sort">
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <Link href="/admin/outreach" className="ml-auto text-xs text-teal-300 underline hover:text-white">Send trial invitations</Link>
      </div>

      {chosen.length > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-teal-500/30 bg-slate-900/95 px-4 py-2.5 text-sm shadow-lg backdrop-blur">
          <b className="text-teal-300">{chosen.length} selected</b>
          {chosen.length < allIds.length && (
            <button className="text-xs text-teal-300 underline hover:text-white" onClick={() => setSel(new Set(allIds))}>Select all {allIds.length} that match</button>
          )}
          <button className={primary} disabled={pending} onClick={() => { if (window.confirm(`Start a ${settings.days}-day trial for ${chosen.length} church${chosen.length === 1 ? "" : "es"}? Ones already on a trial or on the top plan are skipped.`)) bulk("b-grant", (ids) => grantTrialBulk(ids, settings.days)); }}>
            {busy === "b-grant" ? <><Loader2 className="size-3.5 animate-spin" /> Starting…</> : `Start ${settings.days}-day trial`}
          </button>
          <button className={ghost} disabled={pending} onClick={() => bulk("b-e3", (ids) => extendTrialBulk(ids, 3))}>{busy === "b-e3" ? <Loader2 className="size-3.5 animate-spin" /> : "+3 days"}</button>
          <button className={ghost} disabled={pending} onClick={() => bulk("b-e7", (ids) => extendTrialBulk(ids, 7))}>{busy === "b-e7" ? <Loader2 className="size-3.5 animate-spin" /> : "+7 days"}</button>
          <button className={ghost} disabled={pending} onClick={() => { if (window.confirm(`End the trial for ${chosen.length} church${chosen.length === 1 ? "" : "es"} now?`)) bulk("b-end", (ids) => endTrialBulk(ids)); }}>{busy === "b-end" ? <Loader2 className="size-3.5 animate-spin" /> : "End now"}</button>
          <button className={ghost} title="Cancel the trial and let the church start it itself again" disabled={pending} onClick={() => { if (window.confirm(`Reset the trial for ${chosen.length} church${chosen.length === 1 ? "" : "es"}? The trial and its notice go away, and they can start it themselves again.`)) bulk("b-reset", (ids) => resetTrialBulk(ids)); }}>{busy === "b-reset" ? <Loader2 className="size-3.5 animate-spin" /> : "Reset trial"}</button>
          <button className="ml-auto text-xs text-slate-400 hover:text-white" onClick={() => { setSel(new Set()); lastIdx.current = null; }}>Clear</button>
        </div>
      )}

      <AdminCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full select-none text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select this page" checked={pageAllOn} onChange={togglePage} className="size-4 accent-teal-500" /></th>
                <th className="px-2 py-3">Church</th><th className="px-2 py-3 text-right">Members</th><th className="px-2 py-3">Plan</th><th className="px-2 py-3">Trial</th><th className="px-2 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r, idx) => {
                const k = (a: string) => `${a}:${r.churchId}`;
                const on = sel.has(r.churchId);
                return (
                  <tr key={r.churchId} className={cn("align-top hover:bg-white/[0.02]", on && "bg-teal-500/[0.06]")}>
                    <td className="px-4 py-3">
                      <input type="checkbox" aria-label={`Select ${r.name}`} checked={on} readOnly onClick={(e) => tick(idx, e.shiftKey)} className="mt-0.5 size-4 accent-teal-500" />
                    </td>
                    <td className="px-2 py-3 font-medium text-slate-100">{r.name}</td>
                    <td className="px-2 py-3 text-right tabular-nums text-slate-200">{r.members.toLocaleString()}</td>
                    <td className="px-2 py-3 capitalize text-slate-300">{r.paidPlan}</td>
                    <td className="px-2 py-3 text-xs">
                      {r.phase === "active" && <span className="text-teal-300">{cap(r.trialPlan ?? "")} trial: {r.daysLeft} {r.daysLeft === 1 ? "day" : "days"} left (ends {r.endsAt ? day(r.endsAt) : ""})</span>}
                      {r.phase === "ended" && <span className="text-amber-300">{cap(r.trialPlan ?? "")} trial ended {r.endsAt ? day(r.endsAt) : ""}, did not upgrade</span>}
                      {r.phase === "converted" && <span className="text-emerald-400">Upgraded after a {cap(r.trialPlan ?? "")} trial</span>}
                      {r.phase === "none" && (r.canStart ? <span className="text-slate-300">Can try {cap(r.canStart)}</span> : <span className="text-slate-500">{r.blockedReason}</span>)}
                      {r.used.length > 0 && <div className="mt-0.5 text-slate-500">Has tried: {r.used.map(cap).join(", ")}</div>}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {r.phase === "active" ? (
                          <>
                            <button className={ghost} disabled={pending} onClick={() => run(k("e3"), () => extendTrialAction(r.churchId, 3))}>{busy === k("e3") ? <Loader2 className="size-3.5 animate-spin" /> : "+3 days"}</button>
                            <button className={ghost} disabled={pending} onClick={() => run(k("e7"), () => extendTrialAction(r.churchId, 7))}>{busy === k("e7") ? <Loader2 className="size-3.5 animate-spin" /> : "+7 days"}</button>
                            <button className={ghost} disabled={pending} onClick={() => { if (window.confirm(`End ${r.name}'s trial now? They drop back to their plan straight away.`)) run(k("end"), () => endTrialAction(r.churchId)); }}>{busy === k("end") ? <Loader2 className="size-3.5 animate-spin" /> : "End now"}</button>
                          </>
                        ) : r.paidPlan !== "max" ? (
                          <button className={primary} disabled={pending} title="Starts the trial for them right now. To let them start it themselves, send the invitation from Outreach instead." onClick={() => { if (window.confirm(`This starts ${r.name}'s ${settings.days}-day trial right now.

If you want them to start it themselves from the email or text, press Cancel and send the invitation from Outreach instead.`)) run(k("g"), () => grantTrial(r.churchId, settings.days)); }}>
                            {busy === k("g") ? <><Loader2 className="size-3.5 animate-spin" /> Starting…</> : r.canStart ? `Start it for them` : `Give another trial`}
                          </button>
                        ) : null}
                        {(r.phase === "active" || r.phase === "ended") && (
                          <button className={ghost} disabled={pending} title="Cancel the trial and let the church start it itself again" onClick={() => { if (window.confirm(`Reset ${r.name}'s trial? The trial and its notice go away, and they can start it themselves again.`)) run(k("reset"), () => resetTrialAction(r.churchId)); }}>
                            {busy === k("reset") ? <Loader2 className="size-3.5 animate-spin" /> : "Reset"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">No churches match.</td></tr>}
            </tbody>
          </table>
        </div>
      </AdminCard>
      <p className="mt-2 text-xs text-slate-500">Tip: tick one church, then hold Shift and tick another to select everything between them. &quot;Select all&quot; reaches across pages.</p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <AdminCard className="p-4">
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
      {hint && <div className="text-[11px] text-slate-600">{hint}</div>}
    </AdminCard>
  );
}
