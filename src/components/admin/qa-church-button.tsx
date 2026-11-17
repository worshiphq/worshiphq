"use client";

import { useState } from "react";
import { Loader2, FlaskConical, Copy, Check } from "lucide-react";
import { createInternalQaChurch, type QaChurchResult } from "@/app/actions/admin-qa";

const btn = "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-50";

/** Make (or find) the hidden internal QA church. The owner password is shown here once and never again. */
export function QaChurchButton() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<QaChurchResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function go() {
    setBusy(true); setRes(null);
    try {
      setRes(await createInternalQaChurch());
    } catch (e) {
      setRes({ ok: false, error: (e as Error).message || "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button type="button" className={btn} disabled={busy} onClick={go}>
        {busy ? <><Loader2 className="size-3.5 animate-spin" /> Setting up the QA church…</> : <><FlaskConical className="size-3.5" /> Internal QA church</>}
      </button>
      {res && !res.ok && <p className="text-xs text-red-400">{res.error}</p>}
      {res && res.ok && (
        <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3 text-xs text-slate-200">
          <p className="font-semibold text-violet-200">{res.created ? "QA church created." : "The QA church already exists."}</p>
          <p className="mt-1">Church: {res.name} (/{res.slug})</p>
          <p>Owner sign-in: {res.email}</p>
          {res.password ? (
            <div className="mt-2">
              <p className="text-amber-300">Copy this password now. It is not shown again and is not saved anywhere.</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="rounded bg-black/40 px-2 py-1 font-mono text-slate-100">{res.password}</code>
                <button
                  type="button"
                  className={btn}
                  onClick={() => { void navigator.clipboard?.writeText(res.password ?? "").then(() => setCopied(true)).catch(() => {}); }}
                >
                  {copied ? <><Check className="size-3.5" /> Copied</> : <><Copy className="size-3.5" /> Copy</>}
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-slate-400">Lost the password? Delete the QA church from the church list (open it with ?internal=1) and make a new one.</p>
          )}
          <p className="mt-2 text-slate-400">It is hidden from every platform number. List it with <a className="underline" href="/admin?internal=1">?internal=1</a>.</p>
        </div>
      )}
    </div>
  );
}
