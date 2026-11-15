"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, RefreshCw, Paperclip, Lock, Pencil } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { resendEmail, resendAllFailed, checkDeliveries } from "@/app/actions/admin-emails";

export type EmailRow = {
  id: string; to: string; subject: string; status: string; provider: string | null; error: string | null;
  delivery: string | null; deliveryNote: string | null; tries: number; resentAt: string | null;
  canResend: boolean; retryable: boolean; hasFile: boolean; at: string; church: string | null;
};

const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${btn} bg-teal-500 text-slate-950 hover:bg-teal-400`;
const ghost = `${btn} border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10`;
const input = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500/60 focus:outline-none";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** The sender chain, Brevo's emails left today, and the two big buttons. */
export function EmailsToolbar({ chain, brevoLeft, brevoApi, waiting, brevoToday, brevoLimit }: { chain: string[]; brevoLeft: number | null; brevoApi: boolean; waiting: number; brevoToday: number; brevoLimit: number }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState<"" | "all" | "check">("");

  const run = async (kind: "all" | "check") => {
    setBusy(kind);
    const r = await (kind === "all" ? resendAllFailed() : checkDeliveries()).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setBusy("");
    toast(r.ok ? r.message : r.error, r.ok ? "success" : "error");
    router.refresh();
  };

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-sm text-slate-300">
        {chain.length ? (
          <>Sends through <b className="text-white">{chain.join(", then ")}</b>.</>
        ) : (
          <span className="text-amber-300">No email sender is set up here, so emails are only logged.</span>
        )}
        {chain.some((c) => c === "brevo" || c === "smtp") && (
          <> Brevo today: <b className={brevoToday >= brevoLimit ? "text-amber-300" : "text-white"}>{brevoToday.toLocaleString()} of {brevoLimit.toLocaleString()}</b>{brevoToday >= brevoLimit ? ", so new emails go through the next sender" : ""}.</>
        )}
        {brevoLeft != null && <> Brevo&rsquo;s own count: <b className="text-white">{brevoLeft.toLocaleString()}</b> left.</>}
        {!brevoApi && <span className="block text-xs text-slate-500">Add BREVO_API_KEY to see Brevo&rsquo;s emails left and check delivery.</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={ghost} onClick={() => run("check")} disabled={!!busy || !brevoApi} title={brevoApi ? "Ask Brevo whether recent emails were delivered" : "Needs BREVO_API_KEY"}>
          {busy === "check" ? <><Loader2 className="size-4 animate-spin" /> Checking…</> : <><RefreshCw className="size-4" /> Check delivery</>}
        </button>
        <button type="button" className={primary} onClick={() => run("all")} disabled={!!busy}>
          {busy === "all" ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <><Send className="size-4" /> Send all failed{waiting ? ` (${waiting})` : ""}</>}
        </button>
      </div>
    </div>
  );
}

function StatusCell({ r }: { r: EmailRow }) {
  if (r.status === "failed") return <span className="text-rose-300" title={r.error ?? ""}>Failed{r.tries > 1 ? ` (${r.tries} tries)` : ""}</span>;
  if (r.status === "stubbed") return <span className="text-amber-300">Logged only</span>;
  const d = r.delivery;
  const tone = d === "bounced" || d === "blocked" || d === "spam" ? "text-rose-300" : d === "deferred" ? "text-amber-300" : d === "delivered" || d === "opened" ? "text-teal-300" : "text-slate-300";
  const label = !d ? "Sent" : d === "unknown" ? "Sent (Brevo has no record yet)" : d === "waiting" ? "Sent, not delivered yet" : d === "deferred" ? "Delayed, Brevo is retrying" : d[0]!.toUpperCase() + d.slice(1);
  return (
    <span className={tone} title={r.deliveryNote ?? ""}>
      {label}
      <span className="block text-[11px] text-slate-500">via {r.provider}{r.resentAt ? `, sent again ${when(r.resentAt)}` : ""}</span>
      {r.deliveryNote && <span className="block max-w-[16rem] truncate text-[11px] text-slate-500">{r.deliveryNote}</span>}
    </span>
  );
}

/** The list, with Send again (to the same or a corrected address) on each row. */
export function EmailRows({ rows, chain }: { rows: EmailRow[]; chain: string[] }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [edit, setEdit] = useState<{ id: string; to: string } | null>(null);
  const [busy, setBusy] = useState("");

  const send = async (id: string, to?: string, via?: "resend" | "gmail") => {
    setBusy(id);
    const r = await resendEmail(id, to, via).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setBusy("");
    toast(r.ok ? r.message : r.error, r.ok ? "success" : "error");
    if (r.ok) setEdit(null);
    router.refresh();
  };

  if (!rows.length) return <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-slate-500">No emails here yet.</p>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b border-white/10 text-left text-xs text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">When</th>
            <th className="px-4 py-2 font-medium">To</th>
            <th className="px-4 py-2 font-medium">Subject</th>
            <th className="px-4 py-2 font-medium">What happened</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-white/5 align-top last:border-0">
              <td className="whitespace-nowrap px-4 py-3 text-slate-400">{when(r.at)}</td>
              <td className="max-w-[14rem] px-4 py-3">
                <span className="block truncate text-slate-200" title={r.to}>{r.to}</span>
                {r.church && <span className="block truncate text-xs text-slate-500">{r.church}</span>}
              </td>
              <td className="max-w-[18rem] px-4 py-3 text-slate-300">
                <span className="flex items-center gap-1.5">
                  {!r.canResend && <Lock className="size-3.5 shrink-0 text-slate-500" aria-label="Private" />}
                  {r.hasFile && <Paperclip className="size-3.5 shrink-0 text-slate-500" aria-label="Has an attachment" />}
                  <span className="truncate" title={r.subject}>{r.subject}</span>
                </span>
              </td>
              <td className="px-4 py-3"><StatusCell r={r} /></td>
              <td className="px-4 py-3 text-right">
                {r.canResend && (edit?.id === r.id ? (
                  <div className="flex min-w-[18rem] items-center gap-2">
                    <input aria-label="Send to" type="email" autoFocus className={input} value={edit.to} onChange={(e) => setEdit({ id: r.id, to: e.target.value })} />
                    <button type="button" className={primary} disabled={busy === r.id || !edit.to.trim()} onClick={() => send(r.id, edit.to)}>
                      {busy === r.id ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : "Send"}
                    </button>
                    <button type="button" className={ghost} disabled={busy === r.id} onClick={() => setEdit(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="flex justify-end gap-2">
                    {r.retryable && (
                      <button type="button" className={`${ghost} px-2 py-1 text-xs`} disabled={busy === r.id} onClick={() => send(r.id)}>
                        {busy === r.id ? <><Loader2 className="size-3.5 animate-spin" /> Sending…</> : <><Send className="size-3.5" /> Send again</>}
                      </button>
                    )}
                    {chain.includes("resend") && (
                      <button type="button" className={`${ghost} px-2 py-1 text-xs`} disabled={busy === r.id} onClick={() => send(r.id, undefined, "resend")} title="Skip Brevo and send through Resend (Gmail if Resend fails)">
                        <Send className="size-3.5" /> Through Resend
                      </button>
                    )}
                    <button type="button" className={`${ghost} px-2 py-1 text-xs`} disabled={busy === r.id} onClick={() => setEdit({ id: r.id, to: r.to })} title="Send to a corrected address">
                      <Pencil className="size-3.5" /> New address
                    </button>
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
