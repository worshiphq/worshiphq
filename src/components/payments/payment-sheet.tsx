"use client";

import { useRef, useState } from "react";
import { CheckCircle2, CreditCard, Smartphone, XCircle, Clock, UserCheck, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CometSpinner } from "@/components/ui/comet-spinner";
import { MOMO_NETWORKS, MOMO_NETWORK_IDS, prefixMismatch, toLocalGhanaMobile, type MomoNetworkId } from "@/lib/momo/networks";
import { explainMomoFailure } from "@/lib/momo/name-check";
import type { MomoPay, MomoStartResult } from "@/lib/momo/types";
import { submitMomoOtp, checkMomoName, type MomoNameContext, type MomoNameResult } from "@/app/actions/momo";
import { useMomoCharge, type MomoWatch } from "@/components/payments/use-momo-charge";

export type MomoStartOutcome = { ok: true; momo: MomoStartResult } | { ok: false; error: string } | { ok: true; redirected: true };

type Step = "choose" | "submitting" | "approve" | "otp" | "checking" | "success" | "failed" | "timeout" | "card";

const INVALID = "Enter a Ghana mobile number, for example 024 123 4567.";

/** The name check for the number and network on screen. `for` ties a result to the exact number and network asked about. */
type NameCheck =
  | { state: "idle" }
  | { state: "checking"; for: string }
  | { state: "done"; for: string; result: MomoNameResult };

const checkKey = (phone: string | null, network: MomoNetworkId | null) => `${phone ?? ""}|${network ?? ""}`;
const APP_CONTEXT: MomoNameContext = { kind: "app" };

/**
 * Render it only while it is open (each opening starts fresh).
 *
 * Mobile Money first: pick a network, enter the number, confirm the NAME the network has for it, then approve on the
 * phone, all without leaving the page. The name check catches a wrong network (or a ported number) before any prompt
 * is sent; when it can't run, the payer still goes on with their choice. "Card or other" keeps the usual Paystack
 * popup. The server does the charging and the checking; this only shows where it has got to.
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
  nameContext = APP_CONTEXT,
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
  /** Who is asking for the name check: a signed-in church (default) or a public give page. */
  nameContext?: MomoNameContext;
}) {
  const [step, setStep] = useState<Step>("choose"); // always set through go()
  const [phone, setPhone] = useState(defaultPhone ?? "");
  // No network until the payer taps one: the number field appears after that.
  const [network, setNetwork] = useState<MomoNetworkId | null>(null);
  const [nameCheck, setNameCheck] = useState<NameCheck>({ state: "idle" });
  // Set when the name check moved the payer to the network the number is really on.
  const [switchedFrom, setSwitchedFrom] = useState<MomoNetworkId | null>(null);
  const checkSeq = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const last = useRef<MomoStartResult | null>(null);
  const succeeded = useRef(false);
  // The step as of now, for the charge updates that arrive between renders.
  const stepRef = useRef<Step>("choose");
  const go = (next: Step) => { stepRef.current = next; setStep(next); };

  // Every change in the charge moves the sheet along (no effect needed: the hook calls this as it hears back).
  const onUpdate = (w: MomoWatch) => {
    const at = stepRef.current;
    if (at === "choose" || at === "submitting" || at === "success" || at === "card") return;
    switch (w.status) {
      case "success": void finish(); break;
      case "failed": case "error": go("failed"); break;
      case "timeout": go("timeout"); break;
      case "send_otp": go("otp"); break;
      case "pay_offline": case "pending":
        // A finished check after "I have approved it" goes back to waiting; a voucher step stays put.
        if (at !== "otp" && !w.checking) go("approve");
        break;
    }
  };
  const { watch, follow, checkNow, resume, stop } = useMomoCharge(onUpdate);

  async function finish() {
    if (succeeded.current) return;
    succeeded.current = true;
    const m = last.current;
    setFinishing(true);
    try {
      if (m) await onSuccess?.(m.reference, { stubbed: m.stubbed });
    } finally {
      setFinishing(false);
      go("success");
    }
  }

  const local = toLocalGhanaMobile(phone);
  const net = network ? MOMO_NETWORKS[network] : null;
  const mismatch = prefixMismatch(phone, network);
  const check: NameCheck = nameCheck.state !== "idle" && nameCheck.for !== checkKey(local, network) ? { state: "idle" } : nameCheck;
  const checked = check.state === "done" ? check.result : null;

  /** Ask the server who owns this number (and on which network). Never blocks paying: any trouble lets them go on. */
  async function runNameCheck(p: string | null, n: MomoNetworkId | null) {
    if (!p || !n) return;
    const seq = ++checkSeq.current;
    const asked = checkKey(p, n);
    setNameCheck({ state: "checking", for: asked });
    let result: MomoNameResult;
    try {
      result = await checkMomoName({ phone: p, network: n, context: nameContext });
    } catch {
      result = { status: "unavailable" };
    }
    if (seq !== checkSeq.current) return;
    if (result.status === "found" && result.network !== n) {
      // The number is on another network: switch to it and say so.
      setSwitchedFrom(n);
      setNetwork(result.network);
      setNameCheck({ state: "done", for: checkKey(p, result.network), result });
      return;
    }
    setNameCheck({ state: "done", for: asked, result });
  }

  function onPhoneChange(v: string) {
    setPhone(v);
    setError(null);
    setSwitchedFrom(null);
    const p = toLocalGhanaMobile(v);
    // A complete number checks itself straight away.
    if (p && p !== local) void runNameCheck(p, network);
  }

  function pickNetwork(id: MomoNetworkId) {
    if (id === network) return;
    setNetwork(id);
    setError(null);
    setSwitchedFrom(null);
    if (local) void runNameCheck(local, id);
  }

  function changeNumber() {
    checkSeq.current++;
    setPhone("");
    setSwitchedFrom(null);
    setNameCheck({ state: "idle" });
    setError(null);
  }

  async function payMomo(again = false) {
    if (!local) { setError(INVALID); go("choose"); return; }
    if (!network) { setError("Choose your Mobile Money network."); go("choose"); return; }
    setError(null);
    const from = step;
    go("submitting");
    const prev = again && last.current ? { reference: last.current.reference, token: last.current.token } : undefined;
    try {
      const r = await onMomo({ method: "momo", phone: local, network, ...(prev ? { previous: prev } : {}) });
      // A refused retry (the last attempt may still go through) goes back to where the payer was.
      if (!r.ok) { setError(r.error); go(again ? (from === "timeout" ? "timeout" : "failed") : "choose"); return; }
      if ("redirected" in r) return;
      last.current = r.momo;
      succeeded.current = false;
      follow(r.momo);
      if (r.momo.status === "success") { void finish(); return; }
      go(r.momo.status === "send_otp" ? "otp" : "approve");
    } catch {
      setError("Something went wrong. Please try again.");
      go(again ? (from === "timeout" ? "timeout" : "failed") : "choose");
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
      if (r.status === "send_otp" || r.status === "error") { setError(r.message ?? "That code didn't work. Please check it and try again."); if (r.status === "error") go("failed"); return; }
      if (r.status === "success") { last.current = m; void finish(); return; }
      go(r.status === "failed" ? "failed" : "approve");
      resume(r);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setOtpBusy(false);
    }
  }

  function checkAgain() {
    go("checking");
    checkNow();
  }

  const busy = step === "submitting" || cardBusy || otpBusy || finishing;
  const close = () => { if (!busy) { stop(); onClose(); } };
  const display = watch.displayText ?? last.current?.displayText;
  // The start action already explains its own refusals; a failure heard while waiting is explained here.
  const failMessage = error ?? explainMomoFailure(watch.message ?? last.current?.message, net?.label).text;

  return (
    <Modal open={open} onClose={close} title={title} description={`Amount: ${amountLabel}`}>
      {step === "choose" && (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">How would you like to pay?</p>
            <div className={`grid gap-2 ${onCard ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`} role="radiogroup" aria-label="Payment method">
              {MOMO_NETWORK_IDS.map((id) => {
                const n = MOMO_NETWORKS[id];
                const on = network === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pickNetwork(id)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-semibold transition-colors ${on ? "border-primary bg-primary/10 text-ink ring-2 ring-primary/40" : "border-line bg-surface-2 text-ink-muted hover:border-primary/50"}`}
                  >
                    <span className="grid size-9 place-items-center rounded-full text-[0.8rem] font-bold" style={{ background: n.chipBg, color: n.chipFg }} aria-hidden>
                      {n.short}
                    </span>
                    <span className="text-center leading-tight">{n.label}</span>
                  </button>
                );
              })}
              {onCard && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={false}
                  disabled={cardBusy}
                  onClick={payCard}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface-2 p-3 text-xs font-semibold text-ink-muted transition-colors hover:border-primary/50 disabled:opacity-70"
                >
                  <span className="grid size-9 place-items-center rounded-full bg-ink/10 text-ink" aria-hidden>
                    {cardBusy ? <Spinner size="sm" /> : <CreditCard className="size-4" />}
                  </span>
                  <span className="text-center leading-tight">{cardBusy ? "Opening card payment..." : "Card or other"}</span>
                </button>
              )}
            </div>
            {onCard && saveCardNote && <p className="mt-2 text-xs text-ink-muted">{saveCardNote}</p>}
          </div>

          {network && net && (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">{net.label} number</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  autoFocus={!phone}
                  value={phone}
                  onChange={(e) => onPhoneChange(e.target.value)}
                  placeholder="024 123 4567"
                  className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-[1rem] text-ink outline-none focus:border-primary"
                />
              </label>

              {checked?.status === "found" && (
                <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-ink">
                  {switchedFrom && switchedFrom !== checked.network && (
                    <p className="flex items-start gap-2 font-medium">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                      <span>This number is on {MOMO_NETWORKS[checked.network].label}, not {MOMO_NETWORKS[switchedFrom].label}. We switched it for you.</span>
                    </p>
                  )}
                  <p className="flex items-start gap-2">
                    <UserCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span>This number is registered to <b className="font-semibold">{checked.name}</b> on {MOMO_NETWORKS[checked.network].label}. Is this you?</span>
                  </p>
                </div>
              )}

              {checked?.status === "not_found" && (
                <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-ink">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  <span>We couldn&apos;t find a Mobile Money name for this number. Check the number and the network before you pay.</span>
                </p>
              )}
              {checked?.status === "unavailable" && checked.message && <p className="text-xs text-ink-muted">{checked.message}</p>}
              {checked?.status === "invalid" && <p className="text-sm text-danger" role="alert">{checked.message}</p>}

              {checked?.status !== "found" && check.state !== "checking" && mismatch && (
                <p className="text-xs text-ink-muted">
                  This number usually belongs to {MOMO_NETWORKS[mismatch].label}. If you moved your number to {net.label}, keep your choice.
                </p>
              )}
              {error && <p className="text-sm text-danger" role="alert">{error}</p>}

              {checked?.status === "found" ? (
                <div className="space-y-2">
                  <Button type="button" className="w-full" size="lg" onClick={() => payMomo(false)}>
                    <Smartphone /> Yes, pay {amountLabel}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={changeNumber}>Change number</Button>
                </div>
              ) : check.state === "checking" ? (
                <Button type="button" className="w-full" size="lg" disabled>
                  <Spinner size="sm" /> Checking the name on this number...
                </Button>
              ) : check.state === "idle" && local ? (
                <Button type="button" className="w-full" size="lg" onClick={() => void runNameCheck(local, network)}>
                  Continue
                </Button>
              ) : (
                <div className="space-y-2">
                  <Button type="button" className="w-full" size="lg" disabled={!local || checked?.status === "invalid"} onClick={() => payMomo(false)}>
                    <Smartphone /> {checked?.status === "not_found" ? `Pay ${amountLabel} with ${net.label} anyway` : `Pay ${amountLabel} with ${net.label}`}
                  </Button>
                  {checked && <Button type="button" variant="ghost" className="w-full" onClick={changeNumber}>Change number</Button>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {step === "submitting" && (
        <Waiting text="Sending the payment request to your phone..." />
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
            <p className="flex items-center gap-2 text-sm text-ink-muted"><Spinner size="sm" /> Checking with your network...</p>
          ) : (
            <Button type="button" variant="secondary" className="w-full" onClick={checkAgain}>I have approved it</Button>
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
            {otpBusy ? <><Spinner size="sm" /> Confirming...</> : "Confirm code"}
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

      {finishing && step !== "success" && <Waiting text="Payment received. Finishing up..." />}

      {step === "failed" && !finishing && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-ink">
            <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            <p>{failMessage.startsWith("The payment didn") ? failMessage : <>The payment didn&apos;t go through. {failMessage}</>}</p>
          </div>
          <Button type="button" className="w-full" onClick={() => payMomo(true)}>Try again</Button>
          {onCard && (
            <Button type="button" variant="secondary" className="w-full" disabled={cardBusy} onClick={payCard}>
              {cardBusy ? <><Spinner size="sm" /> Opening card payment...</> : <><CreditCard /> Pay by card instead</>}
            </Button>
          )}
          <Button type="button" variant="ghost" className="w-full" onClick={() => { setError(null); go("choose"); }}>Change number or network</Button>
        </div>
      )}

      {step === "timeout" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-4 text-sm text-ink">
            <Clock className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            <p>Still waiting? Check your phone for the prompt, or try again.</p>
          </div>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <Button type="button" className="w-full" onClick={checkAgain}>Check again</Button>
          <Button type="button" variant="secondary" className="w-full" onClick={() => payMomo(true)}>Try again</Button>
          {onCard && (
            <Button type="button" variant="ghost" className="w-full" disabled={cardBusy} onClick={payCard}>
              {cardBusy ? <><Spinner size="sm" /> Opening card payment...</> : <><CreditCard /> Pay by card instead</>}
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
