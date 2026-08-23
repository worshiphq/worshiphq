"use client";

import { useState, useTransition } from "react";
import { Play, Loader2, CheckCircle2 } from "lucide-react";
import { runAutomationsNow } from "@/app/actions/admin";

/** Platform-owner button to fire all scheduled automations immediately. */
export function RunAutomationsButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const summarise = (s: Record<string, unknown>): string => {
    const parts: string[] = [];
    for (const key of ["birthdays", "rosterAnnouncements", "rosterReminders", "groupMeetings", "pledgeReminders"]) {
      const v = s[key] as { sent?: number } | undefined;
      if (v && typeof v.sent === "number") parts.push(`${key}: ${v.sent}`);
    }
    return parts.length ? `Sent — ${parts.join(", ")}` : "Ran. Nothing was due right now.";
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() =>
          start(async () => {
            setResult(null);
            const r = await runAutomationsNow();
            setResult(r?.ok ? summarise(r.summary as Record<string, unknown>) : "Failed to run.");
          })
        }
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        {pending ? "Running…" : "Run automations now"}
      </button>
      {result && (
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-300">
          <CheckCircle2 className="size-4 text-teal-400" /> {result}
        </span>
      )}
    </div>
  );
}
