"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "@/components/ui/app-link";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FEATURE_LABELS, getRouteFeature } from "@/lib/plan-gate";

type TrialAccess = {
  /** The plan being trialled, or null when no trial is running. */
  plan: string | null;
  /** Feature keys the church can use ONLY because of the trial. */
  features: string[];
  /** When the trial started and ends (ISO), and the days left. */
  startedAt: string | null;
  endsAt: string | null;
  daysLeft: number;
};

const NONE: TrialAccess = { plan: null, features: [], startedAt: null, endsAt: null, daysLeft: 0 };
const Ctx = createContext<TrialAccess>(NONE);

export function TrialProvider({ value, children }: { value: TrialAccess; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTrial = () => useContext(Ctx);

/** The plan feature a page URL belongs to: the longest matching route, so /app/giving/statements counts as Giving. */
function featureForPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  for (let n = parts.length; n >= 2; n--) {
    const f = getRouteFeature(`/${parts.slice(0, n).join("/")}`);
    if (f) return f;
  }
  return null;
}

/** Whether a nav link or page is only available because of the trial. */
export function useIsTrialOnly(href: string): boolean {
  const t = useTrial();
  if (!t.plan) return false;
  const f = getRouteFeature(href);
  return !!f && t.features.includes(f);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A small "Trial" label for a page title, shown only on screens the church has because of its trial. */
export function TrialPill() {
  const t = useTrial();
  const pathname = usePathname();
  if (!t.plan) return null;
  const f = featureForPath(pathname);
  if (!f || !t.features.includes(f)) return null;
  return (
    <span
      title={`You have this through your free ${cap(t.plan)} trial. It switches off when the trial ends unless you upgrade.`}
      className="ml-2 inline-flex translate-y-[-2px] items-center rounded-md bg-amber-500/15 px-2 py-0.5 align-middle text-[11px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400"
    >
      Trial
    </span>
  );
}

/**
 * Shown once when a trial has started, the first time a signed-in person opens the app: what the trial switched on, so
 * they know which parts are on trial. Remembered per trial in this browser.
 */
export function TrialWelcome() {
  const t = useTrial();
  const [open, setOpen] = useState(false);
  const key = t.startedAt ? `whq_trial_seen_${t.startedAt}` : null;

  useEffect(() => {
    if (!key || !t.plan || t.features.length === 0) return;
    try { if (!localStorage.getItem(key)) setOpen(true); } catch { /* private window: just skip it */ }
  }, [key, t.plan, t.features.length]);

  if (!open || !t.plan) return null;
  const close = () => { try { if (key) localStorage.setItem(key, "1"); } catch { /* ignore */ } setOpen(false); };
  const names = [...new Set(t.features.map((f) => FEATURE_LABELS[f] ?? f))];

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Your free trial">
      <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 font-display text-lg font-bold"><Sparkles className="size-5 text-primary" /> Your {cap(t.plan)} trial is on</div>
          <button onClick={close} aria-label="Close" className="rounded-lg p-1 text-ink-muted hover:bg-surface-2"><X className="size-5" /></button>
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          You have {t.daysLeft} {t.daysLeft === 1 ? "day" : "days"} of {cap(t.plan)}. These are marked <b className="text-amber-600 dark:text-amber-400">TRIAL</b> in the menu, so you can tell what is on trial:
        </p>
        <ul className="mt-3 grid max-h-56 gap-1 overflow-y-auto text-sm sm:grid-cols-2">
          {names.map((n) => <li key={n} className="flex items-center gap-2"><span className="size-1.5 shrink-0 rounded-full bg-amber-500" />{n}</li>)}
        </ul>
        <p className="mt-3 text-xs text-ink-faint">When the trial ends these switch off again. Nothing is deleted, and upgrading brings them straight back.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Link href="/app/settings?tab=billing" onClick={close} className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface-2">See plans</Link>
          <Button onClick={close}>Got it</Button>
        </div>
      </div>
    </div>
  );
}
