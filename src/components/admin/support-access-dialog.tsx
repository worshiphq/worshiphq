"use client";

import { useState } from "react";
import { KeyRound, Loader2, X, ShieldAlert, LogIn } from "lucide-react";
import { requestSupportAccess, redeemSupportAccess, cancelSupportRequest } from "@/app/actions/support-access";
import { impersonateChurch } from "@/app/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";

type Step = "ask" | "code";

/**
 * "Request access" for a church: sends the church Owner a one-time code, then
 * takes that code back. Emergency entry (no code) sits behind a reason prompt.
 */
export function SupportAccessButton({ churchId, churchName }: { churchId: string; churchName: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("ask");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [requestId, setRequestId] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState<"send" | "enter" | null>(null);
  const [error, setError] = useState("");

  function close() {
    if (requestId && step === "code" && busy === null) void cancelSupportRequest(requestId);
    setOpen(false);
    setStep("ask");
    setReason("");
    setCode("");
    setRequestId("");
    setDevCode(undefined);
    setError("");
  }

  async function send() {
    setBusy("send");
    setError("");
    try {
      const res = await requestSupportAccess(churchId, reason);
      if (!res.ok) return setError(res.error);
      setRequestId(res.requestId);
      setSentTo(res.sentTo);
      setDevCode(res.devCode);
      setStep("code");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function enter() {
    setBusy("enter");
    setError("");
    try {
      const res = await redeemSupportAccess(requestId, code);
      if (!res.ok) return setError(res.error);
      window.location.href = "/app";
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ask the church for a one-time code to enter their account"
        className="inline-flex h-auto items-center gap-1.5 rounded-lg bg-teal-500/15 px-2.5 py-1.5 text-xs font-medium text-teal-300 hover:bg-teal-500/25"
      >
        <KeyRound className="size-3.5" /> Request access
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Access {churchName}</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  {step === "ask"
                    ? "We text the church Owner a one-time code. Access starts when they read it to you."
                    : `Code sent to ${sentTo}. Ask the Owner to read it to you.`}
                </p>
              </div>
              <button type="button" onClick={close} className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>

            {step === "ask" ? (
              <div className="mt-4 space-y-3">
                <label className="block text-xs text-slate-400">
                  What do you need to help with? (optional)
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={300}
                    placeholder="e.g. fix their roster import"
                    className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none"
                  />
                </label>
                {error && <p className="text-xs text-red-300">{error}</p>}
                <button
                  type="button"
                  onClick={send}
                  disabled={busy !== null}
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-teal-500 px-3 text-sm font-medium text-slate-950 hover:bg-teal-400 disabled:opacity-60"
                >
                  {busy === "send" ? <><Loader2 className="size-4 animate-spin" /> Sending code…</> : "Send code to the church"}
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoFocus
                  placeholder="6-digit code"
                  className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-center text-xl tracking-[0.4em] text-slate-100 placeholder:text-sm placeholder:tracking-normal placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none"
                />
                {devCode && <p className="text-xs text-amber-300">Test mode (no SMS keys): the code is {devCode}</p>}
                {error && <p className="text-xs text-red-300">{error}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={enter}
                    disabled={busy !== null || code.length !== 6}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-teal-500 px-3 text-sm font-medium text-slate-950 hover:bg-teal-400 disabled:opacity-60"
                  >
                    {busy === "enter" ? <><Loader2 className="size-4 animate-spin" /> Entering…</> : <><LogIn className="size-4" /> Enter account</>}
                  </button>
                  <button
                    type="button"
                    onClick={send}
                    disabled={busy !== null}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-white/5 px-3 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-60"
                  >
                    {busy === "send" ? <><Loader2 className="size-4 animate-spin" /> Resending…</> : "Resend"}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5 border-t border-white/5 pt-3">
              <form
                action={impersonateChurch.bind(null, churchId)}
                onSubmit={(e) => {
                  const why = prompt(`Emergency entry into ${churchName} without a code.\nWhy is this needed? (recorded)`);
                  if (!why || !why.trim()) {
                    e.preventDefault();
                    return;
                  }
                  (e.currentTarget.elements.namedItem("reason") as HTMLInputElement).value = why.trim();
                }}
                className="flex items-center justify-between gap-3"
              >
                <input type="hidden" name="reason" />
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <ShieldAlert className="size-3.5" /> Extreme situations only
                </span>
                <SubmitButton
                  size="sm"
                  pendingLabel="Entering…"
                  className="h-auto rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-300 shadow-none hover:bg-amber-500/20"
                >
                  Emergency entry
                </SubmitButton>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
