"use client";

import { useIsTrialOnly } from "@/components/app/trial-context";

/** A small amber "TRIAL" tag beside a menu item the church has only because of its free trial. */
export function TrialTag({ href }: { href: string }) {
  const trialOnly = useIsTrialOnly(href);
  if (!trialOnly) return null;
  return (
    <span title="On your free trial. Switches off when the trial ends unless you upgrade." className="relative ml-auto rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
      Trial
    </span>
  );
}
