"use client";

import { useState, useTransition } from "react";
import { notifyGivingApplicantsOfPause } from "@/app/actions/admin";

/**
 * One-time button: email every church currently awaiting online-giving approval that approvals are paused.
 * Safe to click more than once (the action skips churches it already told).
 */
export function NotifyGivingPause({ waiting }: { waiting: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const run = () => {
    if (pending) return;
    if (!confirm(`Email the ${waiting} church${waiting === 1 ? "" : "es"} waiting for online-giving approval to let them know approvals are paused?`)) return;
    setMsg(null);
    start(async () => {
      const r = await notifyGivingApplicantsOfPause();
      if (!r.ok) setMsg(r.error ?? "Could not send the notice.");
      else setMsg(`Sent to ${r.notified} church${r.notified === 1 ? "" : "es"}${r.skipped ? `, skipped ${r.skipped} (already told or no email on file)` : ""}.`);
    });
  };

  if (waiting === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <h2 className="text-sm font-semibold text-slate-100">Churches waiting for approval</h2>
      <p className="mt-1 text-xs text-slate-400">
        {waiting} church{waiting === 1 ? " is" : "es are"} waiting for online giving to be approved. Send them a
        one-time note that approvals are paused, so their request doesn&rsquo;t look stuck. Sent once per church.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-teal-500 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending && (
          <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
          </svg>
        )}
        {pending ? "Sending the notice…" : "Notify churches that approvals are paused"}
      </button>
      {msg && <p className="mt-2 text-xs text-slate-300">{msg}</p>}
    </div>
  );
}
