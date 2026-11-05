"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "@/components/ui/app-link";
import { Loader2, Search, Sparkles } from "lucide-react";
import { AdminCard } from "@/components/admin/admin-shell";
import { useFeedback } from "@/components/ui/feedback";
import { saveTrialSettingsAction, grantTrial, extendTrialAction, endTrialAction } from "@/app/actions/admin-trials";
import { TRIAL_STEPS, MAX_TRIAL_DAYS, type TrialSettings } from "@/lib/trial-settings";
import type { TrialRow, TrialFilter } from "@/lib/data/admin-trials";
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

export function TrialsClient({ settings, rows, counts, conversionPct, filter, q }: {
  settings: TrialSettings; rows: TrialRow[]; counts: Record<TrialFilter, number>; conversionPct: number | null; filter: TrialFilter; q: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<TrialSettings>(settings);
  const [search, setSearch] = useState(q);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const go = (next: { filter?: TrialFilter; q?: string }) => {
    const sp = new URLSearchParams();
    const f = next.filter ?? filter;
    const query = next.q ?? q;
    if (f !== "all") sp.set("filter", f);
    if (query) sp.set("q", query);
    router.push(`${pathname}${sp.toString() ? `?${sp}` : ""}`);
  };

  const run = (key: string, fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) => {
    setBusy(key);
    start(async () => {
      const res = await fn();
      setBusy(null);
      toast(res.ok ? res.message : res.error, res.ok ? "success" : "error");
      if (res.ok) router.refresh();
    });
  };

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
        <Link href="/admin/outreach" className="ml-auto text-xs text-teal-300 underline hover:text-white">Send trial invitations</Link>
      </div>

      <AdminCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Church</th><th className="px-2 py-3">Plan</th><th className="px-2 py-3">Trial</th><th className="px-2 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => {
                const k = (a: string) => `${a}:${r.churchId}`;
                return (
                  <tr key={r.churchId} className="align-top hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-slate-100">{r.name}</td>
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
                          <button className={primary} disabled={pending} onClick={() => run(k("g"), () => grantTrial(r.churchId, settings.days))}>
                            {busy === k("g") ? <><Loader2 className="size-3.5 animate-spin" /> Starting…</> : r.canStart ? `Start ${settings.days}-day trial` : `Give another trial`}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">No churches match.</td></tr>}
            </tbody>
          </table>
        </div>
      </AdminCard>
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
