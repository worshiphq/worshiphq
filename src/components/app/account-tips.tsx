"use client";

import { useEffect, useState } from "react";
import Link from "@/components/ui/app-link";
import { KeyRound, Smartphone, X } from "lucide-react";

const HIDE_KEY = "whq_tip_password_hidden";

/**
 * Small reminders at the top of the dashboard:
 * - verify (or add) the phone number, so the person can get codes and church texts. Stays until it is done.
 * - add a password, for accounts made with Google. Can be hidden.
 */
export function AccountTips({ phone, noPassword }: { phone: "add" | "verify" | null; noPassword: boolean }) {
  const [hidePw, setHidePw] = useState(true);
  useEffect(() => {
    try { setHidePw(localStorage.getItem(HIDE_KEY) === "1"); } catch { setHidePw(false); }
  }, []);

  const showPw = noPassword && !hidePw;
  if (!phone && !showPw) return null;

  return (
    <div className="space-y-2">
      {phone && (
        <Link
          href="/app/account#phone"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-info/40 bg-info/10 px-4 py-3 text-sm transition-colors hover:bg-info/15"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-info/20 text-info"><Smartphone className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <b className="block text-ink">{phone === "add" ? "Add your phone number" : "Verify your phone number"}</b>
            <span className="text-ink-muted">
              {phone === "add"
                ? "So you can receive sign-in codes and important messages about your church by text."
                : "It takes a minute: we text you a 6-digit code. Then you can sign in and reset your password by phone too."}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-info px-3.5 py-1.5 text-xs font-semibold text-white">{phone === "add" ? "Add now" : "Verify now"}</span>
        </Link>
      )}
      {showPw && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><KeyRound className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <b className="block text-ink">Tip: add a password</b>
            <span className="text-ink-muted">You sign in with Google. A password lets you also sign in with your email, for example on a church computer.</span>
          </span>
          <Link href="/app/account" className="shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-bright">Add password</Link>
          <button
            type="button"
            aria-label="Hide this tip"
            onClick={() => { setHidePw(true); try { localStorage.setItem(HIDE_KEY, "1"); } catch {} }}
            className="grid size-8 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
