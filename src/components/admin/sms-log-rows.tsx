"use client";

import { useState } from "react";
import { ChevronDown, Check, X, Bot, User as UserIcon } from "lucide-react";

export type AdminSmsLogItem = {
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
  numbers: { to: string; ok: boolean }[];
  churchName?: string;
  creditsLeftAfter?: number | null;
  creditsLeftNow?: number;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** The owner's view of every church's sends. Dark-themed to match the admin shell; the church-facing
 *  list lives in components/app/sms-log-list.tsx and reads the same rows. */
export function AdminSmsLogRows({ rows }: { rows: AdminSmsLogItem[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (rows.length === 0) {
    return <div className="px-4 py-10 text-center text-slate-500">No sends recorded yet.</div>;
  }

  return (
    <div className="divide-y divide-white/5">
      {rows.map((r) => {
        const failedAll = r.sent === 0;
        const partial = r.sent > 0 && r.sent < r.recipients;
        const expanded = open === r.id;
        return (
          <div key={r.id}>
            <button
              onClick={() => setOpen(expanded ? null : r.id)}
              className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
            >
              <span
                className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${
                  failedAll ? "bg-rose-500/15 text-rose-300" : partial ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"
                }`}
                title={r.trigger === "automatic" ? "Sent automatically" : "Sent by a team member"}
              >
                {r.trigger === "automatic" ? <Bot className="size-3.5" /> : <UserIcon className="size-3.5" />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-slate-100">{r.churchName ?? "Unknown church"}</span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-slate-300">{r.label || "Message"}</span>
                  {!failedAll && !partial && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-300">Sent</span>}
                  {failedAll && <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-rose-300">Nothing sent</span>}
                  {partial && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300">Partly sent</span>}
                </div>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-slate-400">{r.body}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                  <span>{when(r.createdAt)}</span>
                  <span>·</span>
                  <span>{r.sent.toLocaleString()} of {r.recipients.toLocaleString()} sent</span>
                  <span>·</span>
                  <span>{r.credits.toLocaleString()} credits used</span>
                  {r.creditsLeftAfter != null && <><span>·</span><span>{r.creditsLeftAfter.toLocaleString()} left after this</span></>}
                  {r.creditsLeftNow != null && <><span>·</span><span className="text-slate-300">{r.creditsLeftNow.toLocaleString()} left now</span></>}
                  {r.segments > 1 && <><span>·</span><span>{r.segments} parts</span></>}
                  {r.sentByName && <><span>·</span><span>by {r.sentByName}</span></>}
                  {r.senderName && <><span>·</span><span>as {r.senderName}</span></>}
                </div>
              </div>

              <ChevronDown className={`mt-1 size-4 shrink-0 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>

            {expanded && (
              <div className="border-t border-white/5 bg-black/20 px-4 py-4">
                <p className="mb-3 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-slate-200">{r.body}</p>
                {r.numbers.length === 0 ? (
                  <p className="text-xs text-slate-500">No per-number record was kept for this send.</p>
                ) : (
                  <>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Numbers{r.numbers.length < r.recipients ? ` (first ${r.numbers.length} of ${r.recipients})` : ""}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {r.numbers.map((n, i) => (
                        <span
                          key={`${n.to}-${i}`}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs ${
                            n.ok ? "border-emerald-500/25 bg-emerald-500/5 text-slate-300" : "border-rose-500/30 bg-rose-500/5 text-rose-300"
                          }`}
                        >
                          {n.ok ? <Check className="size-3" /> : <X className="size-3" />}
                          {n.to}
                        </span>
                      ))}
                    </div>
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
