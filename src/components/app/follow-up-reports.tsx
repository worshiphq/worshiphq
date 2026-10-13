"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Loader2, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addFollowUpReport, deleteFollowUpReport } from "@/app/actions/follow-ups";
import { REPORT_METHODS, REPORT_OUTCOMES, methodLabel, outcomeLabel, outcomeTone } from "@/lib/follow-ups/outcomes";
import { cn } from "@/lib/utils";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";

export type ReportRow = {
  id: string;
  method: string;
  outcome: string;
  note: string | null;
  authorId: string | null;
  authorName: string;
  createdAt: string;
};

const TONE: Record<string, string> = {
  success: "bg-success/10 text-success border-success/25",
  info: "bg-info/10 text-info border-info/25",
  warning: "bg-warning/10 text-warning border-warning/25",
  danger: "bg-danger/10 text-danger border-danger/25",
  muted: "bg-surface-2 text-ink-muted border-line",
};

export function OutcomePill({ outcome, className }: { outcome: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", TONE[outcomeTone(outcome)], className)}>
      {outcomeLabel(outcome)}
    </span>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** "Give report" form plus the history of reports on one follow-up. */
export function FollowUpReports({
  followUpId, reports, status, me, canWrite, canManage,
}: {
  followUpId: string;
  reports: ReportRow[];
  status: string;
  me: string;
  canWrite: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [method, setMethod] = useState<string>("call");
  const [outcome, setOutcome] = useState<string>("");
  const [note, setNote] = useState("");
  const [markDone, setMarkDone] = useState(false);
  const [busy, setBusy] = useState<"save" | string | null>(null);
  const [error, setError] = useState("");

  async function submit() {
    if (!outcome) return setError("Choose what happened.");
    setBusy("save");
    setError("");
    try {
      const res = await addFollowUpReport({ followUpId, method, outcome, note, markDone });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      setOutcome("");
      setNote("");
      setMarkDone(false);
      setShowAll(true);
      router.refresh();
    } catch {
      setError("Couldn't save the report. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirmBinDelete("Remove this report?")) return;
    setBusy(id);
    setError("");
    try {
      const res = await deleteFollowUpReport(id);
      if (!res.ok) setError(res.error);
      else binDeleted();
      router.refresh();
    } catch {
      setError("Couldn't remove the report.");
    } finally {
      setBusy(null);
    }
  }

  const shown = showAll ? reports : reports.slice(0, 1);

  return (
    <div className="mt-3 border-t border-line pt-3">
      {reports.length > 0 && (
        <div className="space-y-2">
          {shown.map((r) => (
            <div key={r.id} className={cn("rounded-lg bg-surface-2/60 px-3 py-2 text-xs", busy === r.id && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-2">
                <OutcomePill outcome={r.outcome} />
                <span className="text-ink-muted">{methodLabel(r.method)}</span>
                <span className="text-ink-faint">· {r.authorName} · {when(r.createdAt)}</span>
                {canWrite && (r.authorId === me || canManage) && (
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    disabled={busy !== null}
                    className="ml-auto inline-flex items-center gap-1 text-ink-faint hover:text-danger disabled:opacity-40"
                    title="Remove report"
                  >
                    {busy === r.id ? <><Loader2 className="size-3 animate-spin" /> Removing…</> : <Trash2 className="size-3.5" />}
                  </button>
                )}
              </div>
              {r.note && <p className="mt-1 whitespace-pre-line text-ink">{r.note}</p>}
            </div>
          ))}
          {reports.length > 1 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-primary">
              {showAll ? <><ChevronUp className="size-3.5" /> Show latest only</> : <><ChevronDown className="size-3.5" /> All {reports.length} reports</>}
            </button>
          )}
        </div>
      )}

      {canWrite && !open && (
        <Button size="sm" variant="secondary" className={cn(reports.length > 0 && "mt-2")} onClick={() => setOpen(true)}>
          <ClipboardCheck className="size-3.5" /> {reports.length > 0 ? "Add another report" : "Give report"}
        </Button>
      )}

      {open && (
        <div className="mt-2 space-y-3 rounded-xl border border-line bg-surface p-3">
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-muted">How did you reach out?</div>
            <div className="flex flex-wrap gap-1.5">
              {REPORT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={cn(
                    "h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                    method === m.value ? "border-primary/40 bg-primary/10 text-primary" : "border-line text-ink-muted hover:bg-surface-2",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-muted">What happened?</div>
            <div className="flex flex-wrap gap-1.5">
              {REPORT_OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setOutcome(o.value)}
                  className={cn(
                    "h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                    outcome === o.value ? TONE[o.tone] : "border-line text-ink-muted hover:bg-surface-2",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Details (optional): what they said, prayer points, next step…"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          {status !== "done" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} className="size-4 rounded border-line accent-primary" />
              This follow-up is finished (mark it done)
            </label>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={busy !== null}>
              {busy === "save" ? <><Loader2 className="size-3.5 animate-spin" /> Saving report…</> : "Save report"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setOpen(false); setError(""); }} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {!open && error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
