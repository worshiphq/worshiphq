"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CreditCard, Smartphone, XCircle, Clock } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CometSpinner } from "@/components/ui/comet-spinner";
import { MOMO_NETWORKS, MOMO_NETWORK_IDS, detectNetwork, toLocalGhanaMobile, type MomoNetworkId } from "@/lib/momo/networks";
import type { MomoPay, MomoStartResult } from "@/lib/momo/types";
import { submitMomoOtp } from "@/app/actions/momo";
import { useMomoCharge } from "@/components/payments/use-momo-charge";

export type MomoStartOutcome = { ok: true; momo: MomoStartResult } | { ok: false; error: string } | { ok: true; redirected: true };

type Step = "choose" | "submitting" | "approve" | "otp" | "checking" | "success" | "failed" | "timeout" | "card";

const INVALID = "Enter a Ghana mobile number, for example 024 123 4567.";

/**
 * Mobile Money first: pick a network, confirm the number, approve on the phone, all without leaving the page.
 * "Card or other" keeps the usual Paystack popup. The server does the charging and the checking; this only shows
 * where it has got to.
 */
export function PaymentSheet({
  open,
  onClose,
  title = "Pay",
  amountLabel,
  defaultPhone,
  onMomo,
  onCard,
  onSuccess,
  successText = "Payment received.",
  saveCardNote,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** What is being paid, e.g. "₵250". */
  amountLabel: string;
  defaultPhone?: string | null;
  /** Start the Mobile Money charge on the server. */
  onMomo: (pay: Extract<MomoPay, { method: "momo" }>) => Promise<MomoStartOutcome>;
  /** The usual card / Paystack popup path. Leave out to hide the card button. */
  onCard?: () => Promise<void>;
  /** Called once when the payment is confirmed (after any follow-up work it awaits). */
  onSuccess?: (reference: string, momo: { stubbed?: boolean }) => void | Promise<void>;
  successText?: string;
  /** Plans: Mobile Money can't be kept for automatic renewal. */
  saveCardNote?: string;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [network, setNetwork] = useState<MomoNetworkId | null>(() => detectNetwork(defaultPhone));
  const [tapped, setTapped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [checkClicked, setCheckClicked] = useState(false);
  const last = useRef<MomoStartResult | null>(null);
  const succeeded = useRef(false);
  const { watch, follow, checkNow, resume, stop } = useMomoCharge();

  // A fresh sheet each time it opens.
  useEffect(() => {
    if (!open) return;
    setStep("choose");
    setPhone(defaultPhone ?? "");
    setNetwork(detectNetwork(defaultPhone));
    setTapped(false);
    setError(null);
    setOtp("");
    last.current = null;
    succeeded.current = false;
    stop();
  }, [open, defaultPhone, stop]);

  // Follow the charge.
  useEffect(() => {
    if (step === "choose" || step === "submitting" || step === "success" || step === "card") return;
    switch (watch.status) {
      case "success": void finish(); break;
      case "failed": case "error": setStep("failed"); break;
      case "timeout": setStep("timeout"); break;
      case "send_otp": setStep("otp"); break;
      case "pay_offline": case "pending": setStep((s) => (s === "otp" ? s : "approve")); break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch.status]);

  async function finish() {
    if (succeeded.current) return;
    succeeded.current = true;
    const m = last.current;
    setFinishing(true);
    try {
      if (m) await onSuccess?.(m.reference, { stubbed: m.stubbed });
    } finally {
      setFinishing(false);
      setStep("success");
    }
  }

  const detected = detectNetwork(phone);
  const local = toLocalGhanaMobile(phone);
  const net = network ? MOMO_NETWORKS[network] : null;

  function onPhoneChange(v: string) {
    setPhone(v);
    setError(null);
    // Typing picks the network, until the payer taps one themselves (people keep their number when they switch).
    if (!tapped) setNetwork(detectNetwork(v));
  }

  async function payMomo(again = false) {
    if (!local) { setError(INVALID); setStep("choose"); return; }
    if (!network) { setError("Choose your Mobile Money network."); setStep("choose"); return; }
    setError(null);
    const from = step;
    setStep("submitting");
    const prev = again && last.current ? { reference: last.current.reference, token: last.current.token } : undefined;
    try {
      const r = await onMomo({ method: "momo", phone: local, network, ...(prev ? { previous: prev } : {}) });
      // A refused retry (the last attempt may still go through) goes back to where the payer was.
      if (!r.ok) { setError(r.error); setStep(again ? (from === "timeout" ? "timeout" : "failed") : "choose"); return; }
      if ("redirected" in r) return;
      last.current = r.momo;
      succeeded.current = false;
      follow(r.momo);
      if (r.momo.status === "success") { void finish(); return; }
      setStep(r.momo.status === "send_otp" ? "otp" : "approve");
    } catch {
      setError("Something went wrong. Please try again.");
      setStep(again ? (from === "timeout" ? "timeout" : "failed") : "choose");
    }
  }

  async function payCard() {
    if (!onCard) return;
    setCardBusy(true);
    try {
      await onCard();
      onClose();
    } finally {
      setCardBusy(false);
    }
  }

  async function sendOtp() {
    const m = last.current;
    if (!m) return;
    setOtpBusy(true);
    setError(null);
    try {
      const r = await submitMomoOtp(m.reference, m.token, otp);
      if (r.status === "send_otp" || r.status === "error") { setError(r.message ?? "That code didn't work. Please check it and try again."); if (r.status === "error") setStep("failed"); return; }
      if (r.status === "success") { last.current = m; void finish(); return; }
      setStep(r.status === "failed" ? "failed" : "approve");
      resume(r);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setOtpBusy(false);
    }
  }

  function check() {
    setCheckClicked(true);
    setStep("checking");
    checkNow();
  }
  useEffect(() => {
    if (step === "checking" && !watch.checking && checkClicked && (watch.status === "pending" || watch.status === "pay_offline")) {
      setCheckClicked(false);
      setStep("approve");
    }
  }, [step, watch.checking, watch.status, checkClicked]);

  const busy = step === "submitting" || cardBusy || otpBusy || finishing;
  const close = () => { if (!busy) { stop(); onClose(); } };
  const display = watch.displayText ?? last.current?.displayText;
  const failMessage = error ?? watch.message ?? last.current?.message;

  return (
    <Modal open={open} onClose={close} title={title} description={`Amount: ${amountLabel}`}>
      {step === "choose" && (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Mobile Money</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Mobile Money network">
              {MOMO_NETWORK_IDS.map((id) => {
                const n = MOMO_NETWORKS[id];
                const on = network === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => { setNetwork(id); setTapped(true); setError(null); }}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-semibold transition-colors ${on ? "border-primary bg-primary/10 text-ink ring-2 ring-primary/40" : "border-line bg-surface-2 text-ink-muted hover:border-primary/50"}`}
                  >
                    <span className="grid size-9 place-items-center rounded-full text-[0.8rem] font-bold" style={{ background: n.chipBg, color: n.chipFg }} aria-hidden>
                      {n.short}
                    </span>
                    <span className="text-center leading-tight">{n.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">Mobile Money number</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              placeholder="024 123 4567"
              className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-[1rem] text-ink outline-none focus:border-primary"
            />
          </label>
          {tapped && detected && network && detected !== network && (
            <p className="text-xs text-ink-muted">
              This number usually belongs to {MOMO_NETWORKS[detected].label}. If you moved your number to another network, keep your choice.
            </p>
          )}
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}

          <Button type="button" className="w-full" size="lg" onClick={() => payMomo(false)}>
            <Smartphone /> Pay {amountLabel} with Mobile Money
          </Button>
          {onCard && (
            <>
              <Button type="button" variant="secondary" className="w-full" disabled={cardBusy} onClick={payCard}>
                {cardBusy ? <><Spinner size="sm" /> Opening card payment…</> : <><CreditCard /> Card or other</>}
              </Button>
              {saveCardNote && <p className="text-xs text-ink-muted">{saveCardNote}</p>}
            </>
          )}
        </div>
      )}

      {step === "submitting" && (
        <Waiting text="Sending the payment request to your phone…" />
      )}

      {(step === "approve" || step === "checking") && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-4">
            <CometSpinner className="mt-0.5 size-6 shrink-0 text-primary" />
            <div className="text-sm text-ink">
              <p className="font-semibold">Approve the payment on your phone.</p>
              <p className="mt-1 text-ink-muted">
                Enter your MoMo PIN on the prompt from {net?.label ?? "your network"}. Keep this page open.
              </p>
              {display && <p className="mt-2 text-ink-muted">{display}</p>}
            </div>
          </div>
          {step === "checking" || watch.checking ? (
            <p className="flex items-center gap-2 text-sm text-ink-muted"><Spinner size="sm" /> Checking with your network…</p>
          ) : (
            <Button type="button" variant="secondary" className="w-full" onClick={check}>I have approved it</Button>
          )}
        </div>
      )}

      {step === "otp" && (
        <div className="space-y-4">
          <p className="text-sm text-ink">Enter the voucher code. {display}</p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={otp}
            onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "")); setError(null); }}
            placeholder="Code"
            aria-label="Voucher code"
            className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-center font-mono text-[1.15rem] tracking-[0.3em] text-ink outline-none focus:border-primary"
          />
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <Button type="button" className="w-full" disabled={otpBusy || otp.length < 4} onClick={sendOtp}>
            {otpBusy ? <><Spinner size="sm" /> Confirming…</> : "Confirm code"}
          </Button>
        </div>
      )}

      {step === "success" && (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />
          <p className="text-sm font-semibold text-ink">{successText}</p>
          <Button type="button" className="w-full" onClick={() => { stop(); onClose(); }}>Done</Button>
        </div>
      )}

      {finishing && step !== "success" && <Waiting text="Payment received. Finishing up…" />}

      {step === "failed" && !finishing && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-ink">
            <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            <p>The payment didn&apos;t go through. {failMessage || "Please try again."}</p>
          </div>
          <Button type="button" className="w-full" onClick={() => payMomo(true)}>Try again</Button>
          {onCard && (
            <Button type="button" variant="secondary" className="w-full" disabled={cardBusy} onClick={payCard}>
              {cardBusy ? <><Spinner size="sm" /> Opening card payment…</> : <><CreditCard /> Pay by card instead</>}
            </Button>
          )}
          <Button type="button" variant="ghost" className="w-full" onClick={() => { setError(null); setStep("choose"); }}>Change number or network</Button>
        </div>
      )}

      {step === "timeout" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-4 text-sm text-ink">
            <Clock className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            <p>Still waiting? Check your phone for the prompt, or try again.</p>
          </div>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <Button type="button" className="w-full" onClick={check}>Check again</Button>
          <Button type="button" variant="secondary" className="w-full" onClick={() => payMomo(true)}>Try again</Button>
          {onCard && (
            <Button type="button" variant="ghost" className="w-full" disabled={cardBusy} onClick={payCard}>
              {cardBusy ? <><Spinner size="sm" /> Opening card payment…</> : <><CreditCard /> Pay by card instead</>}
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <CometSpinner className="size-10 text-primary" />
      <p className="text-sm text-ink-muted">{text}</p>
    </div>
  );
}
