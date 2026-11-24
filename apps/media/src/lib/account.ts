import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiBase } from "../components/StockLibrary";
import { isDesktopApp } from "./media-src";
import { clearLicence, saveLicence } from "./licence";

/**
 * Signing in to WorshipHQ Live with the church's WorshipHQ account (the same email/phone and password as worshiphq.app).
 * The church's subscription then covers this computer. The app keeps working offline for up to 30 days after the
 * last time it reached WorshipHQ.
 */

export interface MediaEntitlement {
  active: boolean; until: string | null; isTrial: boolean; plan: string; seats: number;
  /** This computer already had its free trial (under some account), so this new account gets none. */
  trialBlocked?: boolean;
}
export interface Account {
  token: string;
  church: { id: string; name: string };
  user: { name: string | null; email: string | null };
  media: MediaEntitlement;
  checkedAt: string;
}
export interface OtherComputer { id: string; name: string; lastSeenAt: string }

export type SignInResult =
  | { ok: true }
  | { ok: false; error: string; seatsFull?: { devices: OtherComputer[] } };

const OFFLINE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

/** Is the church's subscription good on this computer right now (allowing up to 30 days without internet)? */
export function accountActive(a: Account | null): boolean {
  if (!a?.media.active || !a.media.until) return false;
  const now = Date.now();
  const limit = Math.min(new Date(a.media.until).getTime(), new Date(a.checkedAt).getTime() + OFFLINE_DAYS * DAY);
  return now < limit;
}

/** Days left in the church's free trial (null when not on a trial). */
export function trialDaysLeft(a: Account | null): number | null {
  if (!a?.media.isTrial || !a.media.until || !accountActive(a)) return null;
  // Allow an hour of slack so a fresh 14-day trial reads "14 days", not 15.
  return Math.max(0, Math.ceil((new Date(a.media.until).getTime() - Date.now() - 3_600_000) / DAY));
}

interface AccountState {
  account: Account | null;
  /** Set when WorshipHQ says this computer was signed out (shown once on the sign-in screen). */
  notice: string | null;
  signIn: (login: string, password: string, replaceDeviceId?: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  checkIn: () => Promise<void>;
}

async function deviceInfo(): Promise<{ id: string; name: string }> {
  if (!isDesktopApp()) return { id: "browser-dev", name: "Browser preview" };
  const { invoke } = await import("@tauri-apps/api/core");
  const [id, name] = await Promise.all([invoke<string>("get_hwid").catch(() => ""), invoke<string>("computer_name").catch(() => "")]);
  return { id, name: name || "This computer" };
}

export const useAccountStore = create<AccountState>()(persist((set, get) => ({
  account: null,
  notice: null,

  signIn: async (login, password, replaceDeviceId) => {
    const dev = await deviceInfo();
    let res: Response;
    try {
      res = await fetch(`${apiBase()}/api/media/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password, deviceId: dev.id, deviceName: dev.name, replaceDeviceId }),
      });
    } catch {
      return { ok: false, error: "Couldn't reach WorshipHQ. Check this computer's internet and try again." };
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      if (body?.code === "seats_full") return { ok: false, error: body.error, seatsFull: { devices: body.devices ?? [] } };
      return { ok: false, error: body?.error ?? `WorshipHQ didn't answer (${res.status}).` };
    }
    await saveLicence(body.licence);
    const { licence: _l, ...acct } = body;
    set({ account: acct as Account, notice: null });
    return { ok: true };
  },

  signOut: async () => {
    const a = get().account;
    set({ account: null });
    await clearLicence();
    if (a) await fetch(`${apiBase()}/api/media/signout`, { method: "POST", headers: { Authorization: `Bearer ${a.token}` } }).catch(() => {});
  },

  checkIn: async () => {
    const a = get().account;
    if (!a) return;
    try {
      const dev = await deviceInfo();
      const res = await fetch(`${apiBase()}/api/media/check?name=${encodeURIComponent(dev.name)}`, { headers: { Authorization: `Bearer ${a.token}` } });
      const body = await res.json().catch(() => null);
      if (res.status === 401) {
        await clearLicence();
        set({ account: null, notice: body?.error ?? "Please sign in again." });
        return;
      }
      if (!res.ok || !body) return;
      await saveLicence(body.licence);
      set({ account: { ...a, media: body.media, church: body.church ?? a.church, checkedAt: body.checkedAt ?? new Date().toISOString() } });
    } catch {
      /* offline: keep what we had */
    }
  },
}), { name: "whq-account", partialize: (s) => ({ account: s.account }) }));

/** Check in now and every 6 hours while the app is open. */
export function startAccountCheckIns() {
  useAccountStore.getState().checkIn();
  const t = window.setInterval(() => useAccountStore.getState().checkIn(), 6 * 60 * 60 * 1000);
  return () => window.clearInterval(t);
}

/**
 * Headers that show WorshipHQ this copy may use the online extras (AI, backgrounds, cloud backup):
 * the signed-in church account. Null when not signed in.
 */
export async function serverHeaders(): Promise<Record<string, string> | null> {
  const h: Record<string, string> = {};
  const a = useAccountStore.getState().account;
  if (a && accountActive(a)) h.Authorization = `Bearer ${a.token}`;
  return Object.keys(h).length ? h : null;
}

/* ───────────── New account (for churches that only want Media) ───────────── */

export interface NewAccount { church: string; city: string; country: string; name: string; email: string; password: string; acceptedTerms: boolean }

/** Step 1: emails a code. Returns the id to send back with the code. */
export async function startSignUp(a: NewAccount): Promise<{ ok: true; verificationId: string; devCode?: string } | { ok: false; error: string; exists?: boolean }> {
  try {
    const res = await fetch(`${apiBase()}/api/media/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: body?.error ?? `WorshipHQ didn't answer (${res.status}).`, exists: body?.code === "exists" };
    return { ok: true, verificationId: body.verificationId, devCode: body.devCode };
  } catch {
    return { ok: false, error: "Couldn't reach WorshipHQ. Check this computer's internet and try again." };
  }
}

/** Step 2: the code from the email. Makes the account and signs this computer in (with a 14-day free trial). */
export async function finishSignUp(verificationId: string, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const dev = await deviceInfo();
  try {
    const res = await fetch(`${apiBase()}/api/media/signup/verify`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId, code, deviceId: dev.id, deviceName: dev.name }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: body?.error ?? `WorshipHQ didn't answer (${res.status}).` };
    await saveLicence(body.licence);
    const { licence: _l, ...acct } = body;
    useAccountStore.setState({ account: acct as Account, notice: null });
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't reach WorshipHQ. Check this computer's internet and try again." };
  }
}

/* ───────────── Buying WorshipHQ Live ───────────── */

export interface Quote { usd: number; ghs: number; percentOff: number; plan: string }

export async function mediaPrices(): Promise<{ monthly: Quote; yearly: Quote } | null> {
  const a = useAccountStore.getState().account;
  if (!a) return null;
  const res = await fetch(`${apiBase()}/api/media/checkout`, { headers: { Authorization: `Bearer ${a.token}` } }).catch(() => null);
  return res?.ok ? res.json() : null;
}

/** Opens Paystack in the browser. The app picks up the payment on its next check-in (it checks every minute for 15 minutes). */
export async function buyMedia(interval: "monthly" | "yearly"): Promise<void> {
  const a = useAccountStore.getState().account;
  if (!a) throw new Error("Sign in first.");
  const res = await fetch(`${apiBase()}/api/media/checkout`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.token}` }, body: JSON.stringify({ interval }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.url) throw new Error(body?.error ?? `WorshipHQ didn't answer (${res.status}).`);
  try { const { open } = await import("@tauri-apps/plugin-shell"); await open(body.url); } catch { window.open(body.url, "_blank"); }
  // Watch for the payment for a while so Media switches on without a restart.
  let n = 0;
  const t = window.setInterval(async () => {
    n++;
    await useAccountStore.getState().checkIn();
    if (accountActive(useAccountStore.getState().account) && !useAccountStore.getState().account?.media.isTrial || n >= 15) window.clearInterval(t);
  }, 60_000);
}
