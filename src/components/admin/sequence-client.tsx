"use client";

import { useState, useTransition } from "react";
import { Loader2, Send, Play, Save, Eye, EyeOff } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { saveSequenceSettings, sendSequenceTest, runSequenceBatch, refreshSequencePage } from "@/app/actions/admin-sequence";

type StepRow = { id: string; label: string; when: string; subject: string; html: string; sent30: number; sentAll: number; dueNow: number; outcome: string | null };

/** The on/off switch, the daily cap and the per-email switches. */
export function SequenceSettingsForm({ initial, steps, isOwner }: { initial: { enabled: boolean; dailyCap: number; steps: Record<string, boolean> }; steps: StepRow[]; isOwner: boolean }) {
  const { toast } = useFeedback();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [cap, setCap] = useState(initial.dailyCap);
  const [on, setOn] = useState<Record<string, boolean>>(initial.steps);
  const [saving, startSave] = useTransition();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const save = () =>
    startSave(async () => {
      const r = await saveSequenceSettings({ enabled, dailyCap: cap, steps: on });
      toast(r.ok ? (r.message ?? "Saved.") : r.error, r.ok ? "success" : "error");
    });
  // Sends in short batches, one after another, so no single request runs into the host's time limit.
  const runNow = async () => {
    setRunning(true);
    let sent = 0, failed = 0, note: string | undefined, error: string | undefined;
    try {
      for (let i = 0; i < 60; i++) {
        setProgress(`Sending… ${sent} sent so far`);
        const r = await runSequenceBatch();
        if (!r.ok) { error = r.error; break; }
        sent += r.sent; failed += r.failed; note = r.note;
        if (!r.more) break;
      }
    } catch {
      error = "The connection dropped. Whatever was sent is saved: press the button again to carry on.";
    }
    await refreshSequencePage().catch(() => {});
    setRunning(false);
    setProgress(null);
    if (error) toast(`${sent ? `Sent ${sent}. ` : ""}${error}`, "error");
    else toast(`Sent ${sent}${failed ? `, ${failed} failed (they will be tried again)` : ""}.${note ? ` ${note.charAt(0).toUpperCase()}${note.slice(1)}.` : ""}`, "success");
  };

  return (
    <div className="space-y-4">
      <label className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${enabled ? "border-teal-400/50 bg-teal-400/10" : "border-white/10"}`}>
        <span>
          <b className="block text-slate-100">{enabled ? "The sequence is ON" : "The sequence is OFF"}</b>
          <span className="text-xs text-slate-400">When on, due emails go out each morning between 7 and 11 (Ghana time), never on Sundays.</span>
        </span>
        <input type="checkbox" checked={enabled} disabled={!isOwner} onChange={(e) => setEnabled(e.target.checked)} className="size-5 accent-teal-400" />
      </label>

      <label className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4 text-sm">
        <span>
          <b className="block text-slate-100">Most emails a day</b>
          <span className="text-xs text-slate-400">Keeps room for sign-in codes and receipts. Sending also pauses for the day once 200 emails of any kind have gone out.</span>
        </span>
        <input type="number" inputMode="numeric" min={0} max={250} value={cap} disabled={!isOwner} onChange={(e) => setCap(Number(e.target.value))} className="h-10 w-24 rounded-lg border border-white/15 bg-white/5 px-3 text-right" />
      </label>

      <div className="rounded-xl border border-white/10 p-4">
        <b className="mb-2 block text-sm text-slate-100">Which emails can go</b>
        <div className="grid gap-2 sm:grid-cols-2">
          {steps.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={on[s.id] !== false} disabled={!isOwner} onChange={(e) => setOn((o) => ({ ...o, [s.id]: e.target.checked }))} className="size-4 accent-teal-400" />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      {isOwner ? (
        <div className="flex flex-wrap gap-2">
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:opacity-60">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={runNow} disabled={running || !initial.enabled} title={initial.enabled ? "" : "Switch the sequence on and save first"} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50">
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} {running ? (progress ?? "Sending…") : "Send what is due now"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Only the platform owner can change these.</p>
      )}
    </div>
  );
}

/** One email: what it says, who gets it, how it is doing, a preview and a test send. */
export function SequenceStepCard({ step }: { step: StepRow }) {
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [sending, start] = useTransition();
  const test = () =>
    start(async () => {
      const r = await sendSequenceTest(step.id);
      toast(r.ok ? (r.message ?? "Sent.") : r.error, r.ok ? "success" : "error");
    });

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <b className="text-slate-100">{step.label}</b>
          <p className="mt-0.5 text-xs text-slate-400">{step.when}</p>
          <p className="mt-1 truncate text-xs text-slate-500">Subject: {step.subject}</p>
        </div>
        <div className="flex shrink-0 gap-4 text-center text-xs">
          <div><div className="text-lg font-bold text-slate-100">{step.dueNow}</div><div className="text-slate-500">due now</div></div>
          <div><div className="text-lg font-bold text-slate-100">{step.sent30}</div><div className="text-slate-500">sent, 30 days</div></div>
          <div><div className="text-lg font-bold text-slate-100">{step.sentAll}</div><div className="text-slate-500">sent, all</div></div>
        </div>
      </div>
      {step.outcome && <p className="mt-2 text-xs text-teal-300">{step.outcome}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5">
          {open ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} {open ? "Hide" : "Preview"}
        </button>
        <button onClick={test} disabled={sending} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5 disabled:opacity-60">
          {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} {sending ? "Sending…" : "Send me a test"}
        </button>
      </div>
      {open && <iframe title={`Preview: ${step.label}`} srcDoc={step.html} className="mt-3 h-[560px] w-full rounded-xl border border-white/10 bg-white" sandbox="" />}
    </div>
  );
}
