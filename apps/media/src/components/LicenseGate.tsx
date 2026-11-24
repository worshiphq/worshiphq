import { useEffect, useState } from "react";
import { WindowControls } from "./AppShell";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";
import { accountActive, useAccountStore } from "../lib/account";
import { refreshLicence, type LicenceStatus } from "../lib/licence";
import { AccountForms, BuyMedia, SignInDialog } from "./SignIn";
import logoMark from "../assets/worshiphq-mark.png";

function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
}

/**
 * Who may use the app: this computer holds a licence signed by WorshipHQ's server (the "stamp"), which it gets by
 * signing in to a church with an active subscription or free trial. Without one, the sign-in screen.
 * (In the browser preview there is no stamp, so the signed-in account stands in for it.)
 */
export function LicenseGate({ children }: { children: React.ReactNode }) {
  const isLicensed = useProjectionStore((s) => s.isLicensed);
  const isTrial = useProjectionStore((s) => s.isTrial);
  const trialDays = useProjectionStore((s) => s.trialDaysRemaining);
  const account = useAccountStore((s) => s.account);
  const [stamp, setStamp] = useState<LicenceStatus | null>(null);
  const [dialog, setDialog] = useState(false);

  useEffect(() => {
    // Opening the sign-in from anywhere (menu, Settings, Voice page).
    const on = () => setDialog(true);
    window.addEventListener("whq-sign-in", on);
    return () => window.removeEventListener("whq-sign-in", on);
  }, []);

  // Check the stamp at the start, after every sign-in, sign-out or check-in, and every 10 minutes.
  useEffect(() => {
    refreshLicence().then(setStamp);
    const t = window.setInterval(() => refreshLicence().then(setStamp), 10 * 60 * 1000);
    return () => window.clearInterval(t);
  }, [account]);

  if (!stamp) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <div className="text-center">
          <Loader2 className="mx-auto size-8 whq-spin text-primary-bright" />
          <p className="mt-3 text-sm text-ink-muted">Starting…</p>
        </div>
      </div>
    );
  }

  const allowed = isTauri() ? isLicensed : accountActive(account);
  if (!allowed) return <SignInScreen stamp={stamp} />;

  return (
    <>
      {isTrial && <TrialBanner daysRemaining={trialDays} onBuy={() => window.dispatchEvent(new CustomEvent("whq-menu-open", { detail: "help:account" }))} />}
      {dialog && <SignInDialog onClose={() => setDialog(false)} />}
      {children}
    </>
  );
}

function TrialBanner({ daysRemaining, onBuy }: { daysRemaining: number; onBuy: () => void }) {
  if (daysRemaining > 7) return null;
  return (
    <div className="flex items-center gap-2 bg-gold/10 px-4 py-1.5">
      <AlertTriangle className="size-3.5 text-gold" />
      <span className="flex-1 text-[12px] font-medium text-gold">
        Free trial: {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} left. Buy WorshipHQ Live to keep using it after that.
      </span>
      <button onClick={onBuy} className="rounded-md bg-primary px-3 py-1 text-[12px] font-bold text-white hover:bg-primary-bright">Buy WorshipHQ Live</button>
    </div>
  );
}

const longDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

/** Not licensed: sign in / create an account, buy, or (offline too long, clock wrong) say what to fix. */
function SignInScreen({ stamp }: { stamp: LicenceStatus }) {
  const account = useAccountStore((s) => s.account);
  const signOut = useAccountStore((s) => s.signOut);
  const checkIn = useAccountStore((s) => s.checkIn);
  const [busy, setBusy] = useState(false);
  const stillPaid = !!account?.media.active && !!account.media.until && new Date(account.media.until) > new Date();
  const needsInternet = stamp.reason === "expired" && stillPaid;
  const clock = stamp.reason === "clock";
  const ended = !!account && !needsInternet && !clock;

  const title = clock ? "Check this computer's date and time"
    : needsInternet ? "Connect to the internet for a moment"
    : !ended ? "Welcome to WorshipHQ Live"
    : account!.media.trialBlocked ? "Buy WorshipHQ Live"
    : !account!.media.until ? "Buy WorshipHQ Live"
    : account!.media.isTrial ? "Your free trial has ended"
    : "Your subscription has ended";

  const text = clock ? "The clock on this computer is behind the last time WorshipHQ Live ran. Set the right date and time in Windows, then press Try again."
    : needsInternet ? "WorshipHQ Live works without internet for up to 30 days at a time. Connect this computer once so it can renew its licence; it only takes a second."
    : !ended ? "Sign in with your church's WorshipHQ account, or create one. New churches get 14 days free."
    : account!.media.trialBlocked ? <>The free trial isn't available on this computer. Buy WorshipHQ Live for {account!.church.name} below to carry on. If you think this is a mistake, contact WorshipHQ support.</>
    : account!.media.until ? <>WorshipHQ Live for {account!.church.name} ended on {longDate(account!.media.until)}. Buy it below to carry on. Your songs and settings are safe.</>
    : <>Buy WorshipHQ Live for {account!.church.name} below to start using it.</>;

  async function retry() {
    setBusy(true);
    await checkIn();
    await refreshLicence();
    setBusy(false);
  }

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-surface p-6" data-tauri-drag-region>
      <WindowControls />
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface-2 p-8 text-center shadow-sm">
        <img src={logoMark} alt="" className="mx-auto size-16 rounded-2xl bg-white object-contain p-2 ring-1 ring-line" />
        <h2 className="mt-4 text-xl font-bold text-ink">{title}</h2>
        <p className="mb-5 mt-2 text-sm text-ink-muted">{text}</p>
        {needsInternet || clock ? (
          <button onClick={retry} disabled={busy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-bold text-white hover:bg-primary-bright disabled:opacity-60">
            {busy ? <Loader2 className="size-4 whq-spin" /> : <RefreshCw className="size-4" />} Try again
          </button>
        ) : ended ? (
          <div className="grid gap-3 text-left">
            <BuyMedia />
            <button onClick={() => signOut()} className="text-[13px] font-semibold text-ink-muted hover:text-ink">Use a different account</button>
          </div>
        ) : (
          <AccountForms />
        )}
      </div>
    </div>
  );
}
