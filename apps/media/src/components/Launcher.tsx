import { useEffect, useState } from "react";
import {
  Monitor, MonitorSmartphone, Shield, ShieldCheck, Clock, Plus,
  FolderOpen, ChevronRight, Loader2, AlertTriangle, Tv2,
} from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";

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
          const displays = await invoke<any[]>("list_displays");
          setDisplayCount(displays.length);
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

  return (
    <div
      className={`flex h-full flex-col items-center justify-center bg-[#0a0a0f] transition-opacity duration-400 ${fadeOut ? "opacity-0" : "opacity-100"}`}
    >
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.08)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.06)_0%,transparent_50%)]" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        {/* Logo + branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-20 place-items-center rounded-2xl bg-white/[0.06] ring-1 ring-white/[0.08] backdrop-blur-sm">
            <span className="text-3xl font-black tracking-tight text-white">W</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            WorshipHQ <span className="text-sky-400">Media</span>
          </h1>
          <p className="mt-1 text-xs text-white/40">Church Presentation Software</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-6 text-sky-400 animate-spin" />
            <p className="text-sm text-white/50">Initialising...</p>
          </div>
        ) : (
          <>
            {/* Status cards */}
            <div className="mb-8 flex gap-3">
              {/* License status */}
              <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-4 py-3 ring-1 ring-white/[0.06]">
                {isLicensed ? (
                  <>
                    <ShieldCheck className="size-5 text-emerald-400" />
                    <div>
                      <p className="text-xs font-semibold text-emerald-400">Licensed</p>
                      <p className="text-[10px] text-white/40">Full version</p>
                    </div>
                  </>
                ) : isTrial && trialDaysRemaining > 0 ? (
                  <>
                    <Clock className="size-5 text-amber-400" />
                    <div>
                      <p className="text-xs font-semibold text-amber-400">
                        Trial — {trialDaysRemaining} day{trialDaysRemaining !== 1 ? "s" : ""} left
                      </p>
                      <p className="text-[10px] text-white/40">Watermark on output</p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="size-5 text-red-400" />
                    <div>
                      <p className="text-xs font-semibold text-red-400">Trial Expired</p>
                      <p className="text-[10px] text-white/40">Activation required</p>
                    </div>
                  </>
                )}
              </div>

              {/* Display detection */}
              <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-4 py-3 ring-1 ring-white/[0.06]">
                {displayCount > 1 ? (
                  <MonitorSmartphone className="size-5 text-sky-400" />
                ) : (
                  <Monitor className="size-5 text-white/40" />
                )}
                <div>
                  <p className="text-xs font-semibold text-white/80">
                    {displayCount} display{displayCount !== 1 ? "s" : ""} detected
                  </p>
                  <p className="text-[10px] text-white/40">
                    {displayCount > 1
                      ? "Ready for projection"
                      : "Connect a projector for output"}
                  </p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mb-6 flex gap-3">
              <button
                onClick={handleEnter}
                disabled={entering || (!isLicensed && isTrial && trialDaysRemaining <= 0)}
                className="group flex items-center gap-3 rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition-all hover:bg-sky-400 hover:shadow-sky-400/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {entering ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                New Service
                <ChevronRight className="size-4 opacity-50 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>

            {/* Quick tips */}
            <div className="flex items-center gap-2 text-[10px] text-white/25">
              <Tv2 className="size-3" />
              <span>Press F5 to go live · Esc to go black · F7 to clear</span>
            </div>
          </>
        )}

        {/* Version + HWID */}
        <div className="mt-8 text-center">
          <p className="text-[10px] text-white/20">v{version}</p>
          {hwid && hwid !== "unknown" && (
            <p className="mt-0.5 text-[9px] text-white/10 font-mono">{hwid}</p>
          )}
        </div>
      </div>
    </div>
  );
}
