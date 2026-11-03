"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailPlus } from "lucide-react";
import { logRefundRequest } from "@/app/actions/refunds";

/**
 * Churches ask for refunds by email, not from inside the app. When one arrives, paste its payment reference
 * here and it joins the review queue below, to be approved or declined like any other.
 */
export function LogRefundForm() {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setMsg(null);
    start(async () => {
      try {
        const res = await logRefundRequest({ reference, reason });
        if (res.ok) {
          setMsg({ ok: true, text: `Logged for ${res.church}.${res.outsideWindow ? " It is outside the refund window, so it is marked that way for the reviewer." : ""}` });
          setReference("");
          setReason("");
          router.refresh();
        } else {
          setMsg({ ok: false, text: res.error });
        }
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message || "That did not work. Please try again." });
      }
    });
  };

  const field = "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none";
  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-200"><MailPlus className="size-4" /> A refund request came by email?</div>
      <p className="mt-0.5 text-xs text-slate-500">Churches ask for refunds by email, not in the app. Paste the payment reference from their email and add it to the queue.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
        <input className={field} placeholder="Payment reference, e.g. whq_1793..." value={reference} onChange={(e) => setReference(e.target.value)} />
        <input className={field} placeholder="Why they asked (from the email)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button
          type="button" onClick={submit} disabled={pending || !reference.trim() || reason.trim().length < 5}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-teal-400 disabled:opacity-50"
        >
          {pending ? <><Loader2 className="size-4 animate-spin" /> Adding…</> : "Add to queue"}
        </button>
      </div>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p>}
    </div>
  );
}
