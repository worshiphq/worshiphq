import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Shield, Copy, Check, AlertTriangle, Loader2 } from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const { isLicensed, isTrial, trialDaysRemaining, hwid, setLicense } = useProjectionStore();
  const [loading, setLoading] = useState(true);
  const [showActivation, setShowActivation] = useState(false);

  useEffect(() => {
    async function checkLicense() {
      try {
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
      } catch (e) {
        console.error("License check failed:", e);
        setLicense({ isLicensed: false, isTrial: true, trialDaysRemaining: 14, hwid: "unknown" });
      } finally {
        setLoading(false);
      }
    }

    checkLicense();
  }, [setLicense]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <div className="text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-primary-bright" />
          <p className="mt-3 text-sm text-ink-muted">Checking license...</p>
        </div>
      </div>
    );
  }

  if (!isLicensed && isTrial && trialDaysRemaining <= 0) {
    return <TrialExpired hwid={hwid} />;
  }

  return (
    <>
      {isTrial && !isLicensed && (
        <TrialBanner
          daysRemaining={trialDaysRemaining}
          onActivate={() => setShowActivation(true)}
        />
      )}

      {showActivation && (
        <ActivationDialog
          hwid={hwid}
          onClose={() => setShowActivation(false)}
        />
      )}

      {children}
    </>
  );
}

function TrialBanner({ daysRemaining, onActivate }: { daysRemaining: number; onActivate: () => void }) {
  if (daysRemaining > 7) return null;

  return (
    <div className="flex items-center justify-between bg-gold/10 px-4 py-1.5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-3.5 text-gold" />
        <span className="text-[11px] font-medium text-gold">
          {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining in trial
        </span>
      </div>
      <button
        onClick={onActivate}
        className="rounded-md bg-gold/20 px-2.5 py-1 text-[10px] font-semibold text-gold hover:bg-gold/30"
      >
        Activate License
      </button>
    </div>
  );
}

function TrialExpired({ hwid }: { hwid: string }) {
  const [copied, setCopied] = useState(false);
  const [key, setKey] = useState("");

  function copyHwid() {
    navigator.clipboard.writeText(hwid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex h-full items-center justify-center bg-surface">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface-2 p-8 text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-danger/10">
          <Shield className="size-8 text-danger" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-ink">Trial Expired</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Your 14-day trial has ended. Enter your license key to continue using WorshipHQ Media.
        </p>

        <div className="mt-6">
          <label className="block text-left text-[11px] font-medium text-ink-muted">Your Hardware ID</label>
          <div className="mt-1 flex gap-1.5">
            <code className="flex-1 rounded-lg border border-line bg-surface-3 px-3 py-2 text-xs text-ink-faint">{hwid}</code>
            <button onClick={copyHwid} className="grid size-9 place-items-center rounded-lg border border-line transition-colors hover:bg-surface-3">
              {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4 text-ink-faint" />}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-left text-[11px] font-medium text-ink-muted">License Key</label>
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="WHQ-XXXX-XXXX-XXXX-XXXX"
            className="mt-1 w-full rounded-lg border border-line bg-surface-3 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>

        <button className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-bright">
          Activate
        </button>

        <p className="mt-4 text-[11px] text-ink-faint">
          Purchase a license at <span className="text-primary-bright">worshiphq.com/media</span>
        </p>
      </div>
    </div>
  );
}

function ActivationDialog({ hwid, onClose }: { hwid: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [key, setKey] = useState("");

  function copyHwid() {
    navigator.clipboard.writeText(hwid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface-2 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary/10">
            <Shield className="size-5 text-primary-bright" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">Activate License</h3>
            <p className="text-[11px] text-ink-faint">Enter your license key to remove trial limitations</p>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-[11px] font-medium text-ink-muted">Hardware ID</label>
          <div className="mt-1 flex gap-1.5">
            <code className="flex-1 truncate rounded-lg border border-line bg-surface-3 px-3 py-2 text-xs text-ink-faint">{hwid}</code>
            <button onClick={copyHwid} className="grid size-9 shrink-0 place-items-center rounded-lg border border-line transition-colors hover:bg-surface-3">
              {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4 text-ink-faint" />}
            </button>
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-[11px] font-medium text-ink-muted">License Key</label>
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="WHQ-XXXX-XXXX-XXXX-XXXX"
            className="mt-1 w-full rounded-lg border border-line bg-surface-3 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-line py-2 text-xs font-medium text-ink-muted hover:bg-surface-3">
            Cancel
          </button>
          <button className="flex-1 rounded-lg bg-primary py-2 text-xs font-semibold text-white hover:bg-primary-bright">
            Activate
          </button>
        </div>
      </div>
    </div>
  );
}
