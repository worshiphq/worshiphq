import { useEffect, useState } from "react";
import logoMark from "../assets/worshiphq-mark.png";
import {
  Monitor, MonitorSmartphone, Shield, ShieldCheck, Clock, Plus,
  FolderOpen, ChevronRight, Loader2, AlertTriangle, Tv2,
} from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";
import { WindowControls } from "./AppShell";
import { accountActive, trialDaysLeft, useAccountStore } from "../lib/account";
import { refreshLicence } from "../lib/licence";
import pkg from "../../package.json";

function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
}

interface LauncherProps {
  onEnter: () => void;
}

export function Launcher({ onEnter }: LauncherProps) {
  const { isLicensed, isTrial, trialDaysRemaining, hwid, setLicense, setDisplays } =
    useProjectionStore();
  const [loading, setLoading] = useState(true);
  const [displayCount, setDisplayCount] = useState(0);
  const [entering, setEntering] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    async function init() {
      // Check license
      if (isTauri()) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await refreshLicence();

          // Detect displays
          const displays = await invoke<{ id: number; name: string; width: number; height: number; is_primary: boolean }[]>("list_displays");
          setDisplayCount(displays.length);
          setDisplays(displays.map((d) => ({ id: d.id, name: d.name, width: d.width, height: d.height, isPrimary: d.is_primary })));
        } catch (e) {
          console.error("Launcher init failed:", e);
          setLicense({ isLicensed: false, isTrial: true, trialDaysRemaining: 14, hwid: "unknown" });
        }
      } else {
        setLicense({ isLicensed: false, isTrial: true, trialDaysRemaining: 14, hwid: "browser-dev" });
        setDisplayCount(1);
      }

      setLoading(false);
    }

    init();
  }, [setLicense, setDisplays]);

  const handleEnter = () => {
    setEntering(true);
    setFadeOut(true);
    setTimeout(() => onEnter(), 400);
  };

  const version = pkg.version;
  const account = useAccountStore((s) => s.account);
  const subscribed = accountActive(account);
  const { serviceItems, serviceName } = useProjectionStore();
  const hasPlan = serviceItems.length > 0;
  const daysLeft = trialDaysLeft(account);

  return (
    <div
      className={`relative flex h-full flex-col items-center justify-center overflow-hidden bg-surface transition-opacity duration-300 ${fadeOut ? "opacity-0" : "opacity-100"}`}
      data-tauri-drag-region
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(13,148,136,0.14)_0%,transparent_60%)]" />
      <div className="absolute inset-x-0 top-0 h-10" data-tauri-drag-region />
      <WindowControls />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center px-6">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-24 place-items-center rounded-3xl bg-white p-3 shadow-lg ring-1 ring-line">
            <img src={logoMark} alt="WorshipHQ" className="h-full w-full object-contain" draggable={false} />
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-ink">
            WorshipHQ <span className="text-primary">Live</span>
          </h1>
          <p className="mt-1 text-[15px] text-ink-muted">Songs, Bible verses, pictures and videos on your church screen</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-6 animate-spin text-primary" />
            <p className="text-[14px] text-ink-muted">Getting ready…</p>
          </div>
        ) : (
          <>
            <div className="mb-6 grid w-full gap-2">
              <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 shadow-sm">
                {subscribed ? (
                  <>
                    <ShieldCheck className="size-5 text-success" />
                    <div>
                      <p className="text-[14px] font-semibold text-ink">{account!.church.name}</p>
                      <p className="text-[13px] text-ink-muted">{daysLeft !== null ? `Free trial · ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left` : "WorshipHQ subscription"}</p>
                    </div>
                  </>
                ) : isLicensed ? (
                  <>
                    <ShieldCheck className="size-5 text-success" />
                    <div>
                      <p className="text-[14px] font-semibold text-ink">Licensed</p>
                      <p className="text-[13px] text-ink-muted">Full version</p>
                    </div>
                  </>
                ) : (
                  <>
                    <Clock className="size-5 text-gold" />
                    <div>
                      <p className="text-[14px] font-semibold text-ink">Not signed in</p>
                      <p className="text-[13px] text-ink-muted">Sign in or create an account for a 14-day free trial</p>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 shadow-sm">
                {displayCount > 1 ? <MonitorSmartphone className="size-5 text-primary" /> : <Monitor className="size-5 text-ink-faint" />}
                <div>
                  <p className="text-[14px] font-semibold text-ink">
                    {displayCount > 1 ? `Projector connected (${displayCount} screens)` : "Only this screen found"}
                  </p>
                  <p className="text-[13px] text-ink-muted">
                    {displayCount > 1 ? "Ready to show on the big screen" : "Plug in the projector or TV, or test on this screen"}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleEnter}
              disabled={entering}
              className="group flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-primary px-6 text-[17px] font-bold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary-bright disabled:opacity-60"
            >
              {entering ? <Loader2 className="size-5 animate-spin" /> : hasPlan ? <FolderOpen className="size-5" /> : <Plus className="size-5" />}
              {hasPlan ? `Continue: ${serviceName || "your service"}` : "Start"}
              <ChevronRight className="size-5 opacity-70 transition-transform group-hover:translate-x-0.5" />
            </button>
            {hasPlan && <p className="mt-2 text-[13px] text-ink-muted">{serviceItems.length} items planned. You can start a new service from the Service plan.</p>}

            <div className="mt-6 flex items-center gap-2 text-[12px] text-ink-faint">
              <Tv2 className="size-3.5" />
              <span>Ctrl+C clear words · Ctrl+B black · Ctrl+L logo · ← → change slides</span>
            </div>
          </>
        )}

        <div className="mt-8 text-center">
          <p className="text-[12px] text-ink-faint">Version {version}</p>
          {isLicensed && (
            <button
              onClick={async () => {
                if (!window.confirm("Sign this computer out of WorshipHQ? That frees its place so another computer can sign in.")) return;
                await useAccountStore.getState().signOut();
                window.location.reload();
              }}
              className="mt-2 text-[12px] font-semibold text-ink-muted underline-offset-2 hover:text-danger hover:underline"
            >
              Sign out of WorshipHQ on this computer
            </button>
          )}
          {hwid && hwid !== "unknown" && <p className="mt-0.5 font-mono text-[11px] text-ink-faint/70">{hwid}</p>}
        </div>
      </div>
    </div>
  );
}
