"use client";

import { useState } from "react";
import { Loader2, KeyRound, Unlock } from "lucide-react";
import { sendAccountResetLink, unlockAccount } from "@/app/actions/admin-accounts";

const btn = "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-50";

/** Send a password reset link to one account, or lift its 24-hour lock. */
export function AccountActions({ userId, locked }: { userId: string; locked: boolean }) {
  const [busy, setBusy] = useState<"link" | "unlock" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [isLocked, setIsLocked] = useState(locked);

  async function go(kind: "link" | "unlock") {
    setBusy(kind); setMsg(null);
    try {
      const r = kind === "link" ? await sendAccountResetLink(userId) : await unlockAccount(userId);
      setMsg({ ok: r.ok, text: r.ok ? r.message : r.error });
      if (r.ok && kind === "unlock") setIsLocked(false);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={btn} disabled={!!busy} onClick={() => go("link")}>
        {busy === "link" ? <><Loader2 className="size-3.5 animate-spin" /> Sending…</> : <><KeyRound className="size-3.5" /> Send reset link</>}
      </button>
      {isLocked && (
        <button type="button" className={btn} disabled={!!busy} onClick={() => go("unlock")}>
          {busy === "unlock" ? <><Loader2 className="size-3.5 animate-spin" /> Unlocking…</> : <><Unlock className="size-3.5" /> Unlock</>}
        </button>
      )}
      {msg && <span className={`text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</span>}
    </div>
  );
}
