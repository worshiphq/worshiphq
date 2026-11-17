"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MomoChargeStatus } from "@/lib/momo/charge-status";
import type { MomoStartResult } from "@/lib/momo/types";

const POLL_MS = 5_000;
const GIVE_UP_MS = 3 * 60_000;

export type MomoWatch = {
  status: MomoChargeStatus | "idle" | "timeout";
  displayText?: string;
  message?: string;
  /** A check is in flight right now (for the "Checking with your network..." line). */
  checking: boolean;
};

/**
 * Follows one Mobile Money charge through /api/payments/momo/status: every 5 seconds, straight away when the payer
 * comes back to the tab (they approve on their phone, often switching apps), and gives up after 3 minutes
 * ("timeout", from which the sheet offers Check again). The server spaces real Paystack checks 10 seconds apart.
 */
export function useMomoCharge() {
  const [watch, setWatch] = useState<MomoWatch>({ status: "idle", checking: false });
  const charge = useRef<{ reference: string; token: string; startedAt: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const finished = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    abort.current?.abort();
    abort.current = null;
  }, []);

  const poll = useCallback(async (): Promise<void> => {
    const c = charge.current;
    if (!c || finished.current) return;
    clear();
    if (Date.now() - c.startedAt > GIVE_UP_MS) {
      setWatch((w) => ({ ...w, status: "timeout", checking: false }));
      return;
    }
    const ctl = new AbortController();
    abort.current = ctl;
    setWatch((w) => ({ ...w, checking: true }));
    try {
      const res = await fetch(`/api/payments/momo/status?ref=${encodeURIComponent(c.reference)}&t=${encodeURIComponent(c.token)}`, {
        cache: "no-store",
        signal: ctl.signal,
      });
      const body = (await res.json().catch(() => ({}))) as { status?: MomoChargeStatus; displayText?: string; message?: string; done?: boolean };
      if (charge.current !== c) return;
      if (res.status === 403) {
        finished.current = true;
        setWatch({ status: "error", message: body.message ?? "This payment has expired. Please start again.", checking: false });
        return;
      }
      const status = body.status ?? "pending";
      if (status === "success" || status === "failed" || body.done) {
        finished.current = true;
        setWatch({ status, message: body.message, checking: false });
        return;
      }
      setWatch((w) => ({ status: status === "error" ? "pending" : status, displayText: body.displayText ?? w.displayText, message: body.message, checking: false }));
      // A voucher code is needed: wait for the payer instead of polling.
      if (status === "send_otp") return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setWatch((w) => ({ ...w, checking: false }));
    }
    if (!finished.current && charge.current === c) timer.current = setTimeout(() => void poll(), POLL_MS);
  }, [clear]);

  /** Begin following a charge the server just started. */
  const follow = useCallback((m: MomoStartResult) => {
    clear();
    finished.current = m.status === "success";
    charge.current = { reference: m.reference, token: m.token, startedAt: Date.now() };
    setWatch({ status: m.status, displayText: m.displayText, message: m.message, checking: false });
    if (!finished.current && m.status !== "send_otp") timer.current = setTimeout(() => void poll(), POLL_MS);
  }, [clear, poll]);

  /** "Check again" after a timeout, or "I've approved it": a fresh 3-minute window. */
  const checkNow = useCallback(() => {
    const c = charge.current;
    if (!c) return;
    finished.current = false;
    if (Date.now() - c.startedAt > GIVE_UP_MS) charge.current = { ...c, startedAt: Date.now() };
    setWatch((w) => ({ ...w, status: w.status === "timeout" ? "pending" : w.status }));
    void poll();
  }, [poll]);

  /** Resume polling after a voucher code was accepted. */
  const resume = useCallback((s: { status: MomoChargeStatus; displayText?: string; message?: string }) => {
    if (s.status === "success" || s.status === "failed") {
      finished.current = true;
      clear();
      setWatch({ status: s.status, message: s.message, checking: false });
      return;
    }
    setWatch((w) => ({ status: s.status === "error" ? "pending" : s.status, displayText: s.displayText ?? w.displayText, message: s.message, checking: false }));
    if (s.status !== "send_otp") { clear(); timer.current = setTimeout(() => void poll(), POLL_MS); }
  }, [clear, poll]);

  const stop = useCallback(() => {
    clear();
    charge.current = null;
    finished.current = false;
    setWatch({ status: "idle", checking: false });
  }, [clear]);

  // Coming back to the page (after approving on the phone) checks at once.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && charge.current && !finished.current && watch.status !== "timeout" && watch.status !== "send_otp") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [poll, watch.status]);

  useEffect(() => clear, [clear]);

  return { watch, follow, checkNow, resume, stop, current: () => charge.current };
}
