"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2, Check, X, Clock, Loader2, AlertTriangle } from "lucide-react";
import { approveRefund, rejectRefund } from "@/app/actions/refunds";
import { cn } from "@/lib/utils";

interface RefundRow {
  id: string;
  churchName: string;
  amountUsd: number;
  amountGhs: number;
  reason: string;
  status: string;
  requestedAt: string;
  reviewedAt: string | null;
  reviewerNote: string | null;
  failureReason: string | null;
  plan: string;
  interval: string;
  kind: string;
  reference: string;
  paidAt: string;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending review", cls: "bg-amber-500/15 text-amber-300" },
  approved: { label: "Approved", cls: "bg-teal-500/15 text-teal-300" },
  processing: { label: "Processing at bank", cls: "bg-sky-500/15 text-sky-300" },
  processed: { label: "Refunded", cls: "bg-white/10 text-white/60" },
  rejected: { label: "Declined", cls: "bg-white/10 text-white/50" },
  failed: { label: "Failed", cls: "bg-red-500/15 text-red-300" },
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function RefundQueue({ requests }: { requests: RefundRow[] }) {
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  function act(id: string, kind: "approve" | "reject") {
    setError((e) => ({ ...e, [id]: "" }));
    if (kind === "reject" && !(note[id] ?? "").trim()) {
      setError((e) => ({ ...e, [id]: "Give a reason before declining." }));
      return;
    }
    setBusy(`${id}-${kind}`);
    start(async () => {
      const res = kind === "approve" ? await approveRefund(id, note[id]) : await rejectRefund(id, note[id] ?? "");
      setBusy(null);
      if (!res?.ok) { setError((e) => ({ ...e, [id]: res?.error ?? "Something went wrong." })); return; }
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-center gap-2">
        <Undo2 className="size-4 text-white" />
        <h2 className="font-semibold text-white">Refund requests</h2>
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
            {pendingCount} awaiting review
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-white/50">
        Approving issues the refund through Paystack immediately; the bank typically settles it in 5–10 working days.
      </p>

      {requests.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-white/40">
          No refund requests.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {requests.map((r) => {
            const s = STATUS[r.status] ?? STATUS.pending;
            const isPending = r.status === "pending";
            return (
              <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{r.churchName}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", s.cls)}>{s.label}</span>
                      <span className="text-xs capitalize text-white/40">{r.plan} · {r.interval} · {r.kind}</span>
                    </div>
                    <div className="mt-1 text-sm text-white/70">
                      Refund <b>${r.amountUsd.toLocaleString()}</b> (GHS {r.amountGhs.toLocaleString()})
                      <span className="text-white/40"> · paid {fmtDate(r.paidAt)} · requested {fmtDate(r.requestedAt)}</span>
                    </div>
                    <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-white/70">“{r.reason}”</p>
                    {r.reviewerNote && <p className="mt-1 text-xs text-white/40">Note: {r.reviewerNote}</p>}
                    {r.failureReason && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
                        <AlertTriangle className="size-3" /> {r.failureReason}
                      </p>
                    )}
                  </div>
                  {!isPending && (
                    <span className="text-xs text-white/30">
                      {r.reviewedAt ? `Reviewed ${fmtDate(r.reviewedAt)}` : ""}
                    </span>
                  )}
                </div>

                {isPending && (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <input
                      value={note[r.id] ?? ""}
                      onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))}
                      placeholder="Note to the church (required to decline, optional to approve)"
                      className="mb-2 h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus-visible:border-teal-400/60 focus-visible:outline-none"
                    />
                    {error[r.id] && <p className="mb-2 text-xs text-red-400">{error[r.id]}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => act(r.id, "approve")}
                        disabled={pending}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-500 px-3 text-sm font-semibold text-white hover:bg-teal-400 disabled:opacity-60"
                      >
                        {busy === `${r.id}-approve` ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                        Approve &amp; refund
                      </button>
                      <button
                        onClick={() => act(r.id, "reject")}
                        disabled={pending}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-sm font-medium text-white/70 hover:text-white disabled:opacity-60"
                      >
                        {busy === `${r.id}-reject` ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                        Decline
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
