"use client";

import { useState } from "react";
import { ChevronDown, Check, CheckCheck, X, Clock, Bot, User as UserIcon } from "lucide-react";
import { STATE_LABEL, type DeliveryState } from "@/lib/sms/delivery-status";
import { cn } from "@/lib/utils";

export type SmsLogItem = {
  id: string;
  createdAt: string;
  label: string | null;
  body: string;
  segments: number;
  recipients: number;
  sent: number;
  credits: number;
  senderName: string | null;
  sentByName: string | null;
  trigger: string;
  numbers: { to: string; ok: boolean; st?: DeliveryState; e?: string }[];
  delivered?: number;
  failed?: number;
  pending?: number;
  churchName?: string;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });

/** Shown on both the church's own log and the owner's all-churches log, so one change fixes both. */
export function SmsLogList({ rows, showChurch = false }: { rows: SmsLogItem[]; showChurch?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);

  if (rows.length === 0) {
    return <div className="p-8 text-center text-sm text-ink-muted">No messages have been sent yet.</div>;
  }

  return (
    <div className="divide-y divide-line-soft">
      {rows.map((r) => {
        const failedCount = r.failed ?? Math.max(0, r.recipients - r.sent);
        const failedAll = r.sent === 0 || failedCount >= r.recipients;
        const partial = !failedAll && failedCount > 0;
        const waiting = r.pending ?? 0;
        const confirmed = r.delivered ?? 0;
        const expanded = open === r.id;
        return (
          <div key={r.id}>
            <button
              onClick={() => setOpen(expanded ? null : r.id)}
              className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-2"
            >
              <span
                className={cn(
                  "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                  failedAll ? "bg-danger/10 text-danger" : partial ? "bg-warning/10 text-warning" : "bg-success/10 text-success",
                )}
                title={r.trigger === "automatic" ? "Sent automatically" : "Sent by a team member"}
              >
                {r.trigger === "automatic" ? <Bot className="size-4" /> : <UserIcon className="size-4" />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-ink">{r.label || "Message"}</span>
                  {showChurch && r.churchName && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">{r.churchName}</span>
                  )}
                  {failedAll && <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[11px] font-semibold text-danger">Nothing delivered</span>}
                  {partial && <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[11px] font-semibold text-warning">{failedCount.toLocaleString()} not delivered</span>}
                  {!failedAll && waiting > 0 && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">{waiting.toLocaleString()} waiting for the network</span>}
                </div>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-ink-muted">{r.body}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
                  <span>{when(r.createdAt)}</span>
                  <span>·</span>
                  <span>{r.sent.toLocaleString()} of {r.recipients.toLocaleString()} sent{confirmed > 0 ? `, ${confirmed.toLocaleString()} confirmed delivered` : ""}</span>
                  <span>·</span>
                  <span>{r.credits.toLocaleString()} {r.credits === 1 ? "credit" : "credits"}</span>
                  {r.segments > 1 && <><span>·</span><span>{r.segments} parts each</span></>}
                  {r.sentByName && <><span>·</span><span>by {r.sentByName}</span></>}
                  {r.senderName && <><span>·</span><span>as {r.senderName}</span></>}
                </div>
              </div>

              <ChevronDown className={cn("mt-1 size-4 shrink-0 text-ink-faint transition-transform", expanded && "rotate-180")} />
            </button>

            {expanded && (
              <div className="border-t border-line-soft bg-surface-2/50 px-5 py-4">
                <p className="mb-3 whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 text-sm text-ink">{r.body}</p>
                {r.numbers.length === 0 ? (
                  <p className="text-xs text-ink-faint">No per-number record was kept for this send.</p>
                ) : (
                  <>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                      Numbers{r.numbers.length < r.recipients ? ` (first ${r.numbers.length} of ${r.recipients})` : ""}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {r.numbers.map((n, i) => {
                        const st: DeliveryState = n.st ?? (n.ok ? "sent" : "failed");
                        return (
                          <span
                            key={`${n.to}-${i}`}
                            title={`${STATE_LABEL[st]}${n.e ? `: ${n.e}` : ""}`}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs",
                              st === "delivered" ? "border-success/40 bg-success/10 text-success"
                                : st === "failed" ? "border-danger/30 bg-danger/5 text-danger"
                                : st === "pending" ? "border-line bg-surface text-ink-muted"
                                : "border-success/30 bg-success/5 text-ink-muted",
                            )}
                          >
                            {st === "delivered" ? <CheckCheck className="size-3" /> : st === "failed" ? <X className="size-3" /> : st === "pending" ? <Clock className="size-3" /> : <Check className="size-3" />}
                            {n.to}
                          </span>
                        );
                      })}
                    </div>
                    <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-faint">
                      <span className="inline-flex items-center gap-1"><CheckCheck className="size-3 text-success" /> Delivered to the phone</span>
                      <span className="inline-flex items-center gap-1"><Check className="size-3" /> Sent (no report from the network)</span>
                      <span className="inline-flex items-center gap-1"><Clock className="size-3" /> Waiting for the network</span>
                      <span className="inline-flex items-center gap-1"><X className="size-3 text-danger" /> Not delivered (hover for the reason)</span>
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
