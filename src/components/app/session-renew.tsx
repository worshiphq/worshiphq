"use client";

import { useEffect } from "react";
import { renewSession } from "@/app/actions/auth";

const KEY = "whq-session-renewed";
const EVERY = 12 * 60 * 60 * 1000;

/** Quietly keeps an active person signed in. Runs at most twice a day per browser and does nothing the person can see. */
export function SessionRenew() {
  useEffect(() => {
    try {
      const last = Number(localStorage.getItem(KEY) ?? 0);
      if (Date.now() - last < EVERY) return;
      localStorage.setItem(KEY, String(Date.now()));
    } catch { /* storage blocked: renew anyway */ }
    renewSession().catch(() => {});
  }, []);
  return null;
}
