"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Clock, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { startPlanTrial } from "@/app/actions/trials";
import { DismissibleNotice } from "@/components/app/dismissible-notice";
import type { TrialStep } from "@/lib/trial-settings";

export type TrialCardInfo = {
  phase: "none" | "active" | "ended" | "converted";
  plan: TrialStep | null;
  endsAt: string | null;
  daysLeft: number;
  canStart: TrialStep | null;
  days: number;
};

const label = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);
const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * The free trial of the next plan up, on the Billing tab. Offers it, shows the days left while it runs, and nudges to
 * upgrade when it has ended. Starting one is for the Main Admin only.
 */
export function TrialCard({ trial, isOwner, readOnly, highlights, onUpgrade }: {
  trial: TrialCardInfo;
  isOwner: boolean;
  readOnly: boolean;
  /** A few things the trial plan adds, from the plan's own list. */
  highlights: string[];
  /** Opens the upgrade dialog for a plan. */
  onUpgrade: (plan: TrialStep) => void;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  if (trial.phase === "active" && trial.plan) {
    return (
      <div className="mb-5 rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Clock className="size-4" /> {label(trial.plan)} trial: {trial.daysLeft} {trial.daysLeft === 1 ? "day" : "days"} left</div>
            <p className="mt-1 text-sm text-ink-muted">You have all the {label(trial.plan)} features until {trial.endsAt ? dateOf(trial.endsAt) : "the trial ends"}. After that your church goes back to its plan, and the {label(trial.plan)} features switch off. Your data stays safe.</p>
          </div>
          {isOwner && !readOnly && (
            <Button onClick={() => onUpgrade(trial.plan!)}>Keep {label(trial.plan)} <ArrowRight className="size-4" /></Button>
          )}
        </div>
      </div>
    );
  }

  if (trial.phase === "ended" && trial.plan) {
    return (
      <DismissibleNotice id={`trial-ended-card-${trial.endsAt}`}>
      <div className="mb-5 rounded-2xl border border-warning/30 bg-warning/10 p-5 pr-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-warning">Your {label(trial.plan)} trial has ended</div>
            <p className="mt-1 text-sm text-ink-muted">The {label(trial.plan)} features are switched off again. Upgrade whenever you are ready and they come straight back, with everything you set up.</p>
          </div>
          {isOwner && !readOnly && (
            <Button onClick={() => onUpgrade(trial.plan!)}>Upgrade to {label(trial.plan)} <ArrowRight className="size-4" /></Button>
          )}
        </div>
      </div>
      </DismissibleNotice>
    );
  }

  if (trial.phase === "none" && trial.canStart) {
    const target = trial.canStart;
    return (
      <div className="mb-5 rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> Try {label(target)} free for {trial.days} days</div>
            <p className="mt-1 text-sm text-ink-muted">See what {label(target)} does for your church before you pay anything. No card needed. When the {trial.days} days are up your church goes back to its current plan.</p>
            {highlights.length > 0 && (
              <ul className="mt-2 grid gap-1 text-sm text-ink-muted sm:grid-cols-2">
                {highlights.slice(0, 4).map((h) => <li key={h} className="flex gap-2"><span className="text-primary">+</span><span>{h}</span></li>)}
              </ul>
            )}
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          </div>
          <Button
            disabled={!isOwner || readOnly || pending}
            title={!isOwner ? "Only the Main Admin can start a trial" : undefined}
            onClick={() => {
              setError("");
              start(async () => {
                const res = await startPlanTrial();
                if (!res.ok) { setError(res.error); return; }
                toast(`Your ${label(res.plan)} trial has started`, "success");
                router.refresh();
              });
            }}
          >
            {pending ? <><Loader2 className="size-4 animate-spin" /> Starting…</> : <>Start my {trial.days}-day {label(target)} trial</>}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
