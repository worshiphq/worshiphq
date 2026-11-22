import { useEffect, useState } from "react";
import {
  Monitor, MonitorSmartphone, Shield, ShieldCheck, Clock, Plus,
  FolderOpen, ChevronRight, Loader2, AlertTriangle, Tv2,
} from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";
import { WindowControls } from "./AppShell";

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
          const deviceHwid = await invoke<string>("get_hwid");
          const status = await invoke<{
            is_licensed: boolean;
            is_trial: boolean;
            trial_days_remaining: number;
            hwid: string;
          }>("check_license", { hwid: deviceHwid });

          setLicense({
            isLicensed: status.is_licensed,
            isTrial: status.is_trial,
            trialDaysRemaining: status.trial_days_remaining,
            hwid: status.hwid,
          });

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

  const version = "0.1.0";
  const { serviceItems, serviceName } = useProjectionStore();
  const hasPlan = serviceItems.length > 0;
  const trialOver = !isLicensed && !(isTrial && trialDaysRemaining > 0);

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
          <div className="mx-auto mb-4 grid size-20 place-items-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
            <span className="text-3xl font-black tracking-tight text-white">W</span>
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-ink">
            WorshipHQ <span className="text-primary">Media</span>
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
                {isLicensed ? (
                  <>
                    <ShieldCheck className="size-5 text-success" />
                    <div>
                      <p className="text-[14px] font-semibold text-ink">Licensed</p>
                      <p className="text-[13px] text-ink-muted">Full version</p>
                    </div>
                  </>
                ) : !trialOver ? (
                  <>
                    <Clock className="size-5 text-gold" />
                    <div>
                      <p className="text-[14px] font-semibold text-ink">Free trial · {trialDaysRemaining} day{trialDaysRemaining !== 1 ? "s" : ""} left</p>
                      <p className="text-[13px] text-ink-muted">A small “Trial” mark shows on the projector</p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="size-5 text-danger" />
                    <div>
                      <p className="text-[14px] font-semibold text-ink">Your free trial has ended</p>
                      <p className="text-[13px] text-ink-muted">Open the app to enter your licence key</p>
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
                if (!window.confirm("Remove the licence from this computer? You can enter the key again any time.")) return;
                const { invoke } = await import("@tauri-apps/api/core");
                await invoke("remove_license");
                window.location.reload();
              }}
              className="mt-2 text-[12px] font-semibold text-ink-muted underline-offset-2 hover:text-danger hover:underline"
            >
              Remove licence from this computer (sign out)
            </button>
          )}
          {hwid && hwid !== "unknown" && <p className="mt-0.5 font-mono text-[11px] text-ink-faint/70">{hwid}</p>}
        </div>
      </div>
    </div>
  );
}
