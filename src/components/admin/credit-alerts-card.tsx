"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { sendCreditAlert } from "@/app/actions/admin-credits";
import { useFeedback } from "@/components/ui/feedback";
import { PagedList } from "@/components/admin/pager";
import type { OutOfCreditsChurch } from "@/lib/sms/credit-alerts";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Churches whose texts are being held back because their credits ran out, with a button to email each one again. */
export function CreditAlertsCard({ rows }: { rows: OutOfCreditsChurch[] }) {
  const { toast } = useFeedback();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function send(c: OutOfCreditsChurch) {
    const before = c.lastEmail?.ok ? ` They were last emailed on ${day(c.lastEmail.at)}.` : "";
    if (!confirm(`Email ${c.contact?.email} that ${c.name} has ${c.credits} SMS credits left?${before}`)) return;
    setBusy(c.id);
    const r = await sendCreditAlert(c.id).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setBusy(null);
    if (r.ok) { toast(r.stubbed ? "Email is not connected here, so nothing was sent." : `Emailed ${c.name}.`, r.stubbed ? "error" : "success"); router.refresh(); }
    else toast(r.error, "error");
  }

  return (
    <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Out of credits, messages not sending <span className="text-slate-500">({rows.length})</span></h2>
        <p className="text-xs text-slate-500">Each church gets one automatic email when its messages are first held back, and no more until it tops up and runs out again. Use the button to email again yourself.</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-sm text-slate-500">No church has messages held back for credits in the last 30 days.</p>
      ) : (
        <div className="px-4 pb-3">
          <PagedList items={rows} size={10} wrap={(kids) => <ul className="divide-y divide-white/5">{kids}</ul>} render={(c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
              <div className="min-w-52 flex-1">
                <div className="font-medium text-slate-100">{c.name} <span className="ml-1 rounded bg-white/5 px-1.5 py-0.5 text-[11px] capitalize text-slate-400">{c.plan}</span></div>
                <div className="mt-0.5 text-xs text-slate-500">
                  <span className={c.credits <= 0 ? "text-rose-300" : "text-amber-300"}>{c.credits} credit{c.credits === 1 ? "" : "s"} left</span>
                  {" · "}{c.blockedTexts.toLocaleString()} text{c.blockedTexts === 1 ? "" : "s"} held back, last on {day(c.lastBlocked)}
                </div>
                <div className="mt-0.5 break-all text-xs text-slate-500">{c.contact ? `${c.contact.name}, ${c.contact.email}` : "No email address on file"}</div>
              </div>
              <div className="text-xs">
                {c.lastEmail
                  ? c.lastEmail.ok
                    ? <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="size-3.5" /> Emailed {day(c.lastEmail.at)}{c.lastEmail.auto ? " (automatic)" : " (by you)"}</span>
                    : <span className="text-rose-300">Email on {day(c.lastEmail.at)} did not go</span>
                  : <span className="text-slate-500">Not emailed yet</span>}
              </div>
              <button type="button" disabled={!c.contact || busy !== null} onClick={() => send(c)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-50">
                {busy === c.id ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <><Mail className="size-4" /> {c.lastEmail?.ok ? "Email again" : "Email now"}</>}
              </button>
            </li>
          )} />
        </div>
      )}
    </div>
  );
}
