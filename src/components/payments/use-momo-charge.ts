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

const IDLE: MomoWatch = { status: "idle", checking: false };

/**
 * Follows one Mobile Money charge through /api/payments/momo/status: every 5 seconds, straight away when the payer
 * comes back to the tab (they approve on their phone, often switching apps), and gives up after 3 minutes
 * ("timeout", from which the sheet offers Check again). The server spaces real Paystack checks 10 seconds apart.
 * `onUpdate` hears every change, so the sheet can move between its steps without an effect.
 */
export function useMomoCharge(onUpdate?: (w: MomoWatch) => void) {
  const [watch, setWatchState] = useState<MomoWatch>(IDLE);
  const current = useRef<MomoWatch>(IDLE);
  const listener = useRef(onUpdate);
  const charge = useRef<{ reference: string; token: string; startedAt: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const finished = useRef(false);
  const pollRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => { listener.current = onUpdate; }, [onUpdate]);

  const emit = useCallback((next: MomoWatch | ((w: MomoWatch) => MomoWatch)) => {
    const value = typeof next === "function" ? next(current.current) : next;
    current.current = value;
    setWatchState(value);
    listener.current?.(value);
  }, []);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    abort.current?.abort();
    abort.current = null;
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void pollRef.current(), POLL_MS);
  }, []);

  const poll = useCallback(async (): Promise<void> => {
    const c = charge.current;
    if (!c || finished.current) return;
    clear();
    if (Date.now() - c.startedAt > GIVE_UP_MS) {
      emit((w) => ({ ...w, status: "timeout", checking: false }));
      return;
    }
    const ctl = new AbortController();
    abort.current = ctl;
    emit((w) => ({ ...w, checking: true }));
    try {
      const res = await fetch(`/api/payments/momo/status?ref=${encodeURIComponent(c.reference)}&t=${encodeURIComponent(c.token)}`, {
        cache: "no-store",
        signal: ctl.signal,
      });
      const body = (await res.json().catch(() => ({}))) as { status?: MomoChargeStatus; displayText?: string; message?: string; done?: boolean };
      if (charge.current !== c) return;
      if (res.status === 403) {
        finished.current = true;
        emit({ status: "error", message: body.message ?? "This payment has expired. Please start again.", checking: false });
        return;
      }
      const status = body.status ?? "pending";
      if (status === "success" || status === "failed" || body.done) {
        finished.current = true;
        emit({ status, message: body.message, checking: false });
        return;
      }
      emit((w) => ({ status: status === "error" ? "pending" : status, displayText: body.displayText ?? w.displayText, message: body.message, checking: false }));
      // A voucher code is needed: wait for the payer instead of polling.
      if (status === "send_otp") return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      emit((w) => ({ ...w, checking: false }));
    }
    if (!finished.current && charge.current === c) schedule();
  }, [clear, emit, schedule]);

  useEffect(() => { pollRef.current = poll; }, [poll]);

  /** Begin following a charge the server just started. */
  const follow = useCallback((m: MomoStartResult) => {
    clear();
    finished.current = m.status === "success";
    charge.current = { reference: m.reference, token: m.token, startedAt: Date.now() };
    emit({ status: m.status, displayText: m.displayText, message: m.message, checking: false });
    if (!finished.current && m.status !== "send_otp") schedule();
  }, [clear, emit, schedule]);

  /** "Check again" after a timeout, or "I have approved it": a fresh 3-minute window. */
  const checkNow = useCallback(() => {
    const c = charge.current;
    if (!c) return;
    finished.current = false;
    if (Date.now() - c.startedAt > GIVE_UP_MS) charge.current = { ...c, startedAt: Date.now() };
    void poll();
  }, [poll]);

  /** Carry on after a voucher code was sent. */
  const resume = useCallback((s: { status: MomoChargeStatus; displayText?: string; message?: string }) => {
    clear();
    if (s.status === "success" || s.status === "failed") {
      finished.current = true;
      emit({ status: s.status, message: s.message, checking: false });
      return;
    }
    emit((w) => ({ status: s.status === "error" ? "pending" : s.status, displayText: s.displayText ?? w.displayText, message: s.message, checking: false }));
    if (s.status !== "send_otp") schedule();
  }, [clear, emit, schedule]);

  const stop = useCallback(() => {
    clear();
    charge.current = null;
    finished.current = false;
    current.current = IDLE;
    setWatchState(IDLE);
  }, [clear]);

  // Coming back to the page (after approving on the phone) checks at once.
  useEffect(() => {
    const onVisible = () => {
      const s = current.current.status;
      if (document.visibilityState === "visible" && charge.current && !finished.current && s !== "timeout" && s !== "send_otp") void pollRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => clear, [clear]);

  return { watch, follow, checkNow, resume, stop };
}
