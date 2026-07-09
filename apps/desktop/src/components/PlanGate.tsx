import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, Wifi, WifiOff, Clock, AlertTriangle, ExternalLink } from "lucide-react";
import { plan as planApi, auth } from "../lib/api";
import type { PlanInfo } from "../lib/api";
import { useAppStore } from "../stores/app-store";

interface Props {
  children: React.ReactNode;
}

type GateState = "checking" | "ok" | "warning" | "expired" | "error";

export function PlanGate({ children }: Props) {
  const { session, showToast, setSession, setPlanInfo: setStorePlan } = useAppStore();
  const [state, setState] = useState<GateState>("checking");
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!session) return;
    checkPlan();
  }, [session]);

  async function checkPlan() {
    setState("checking");

    // Try to refresh from server first (requires internet)
    const refreshResult = await planApi.refresh();

    let info: PlanInfo;
    if (refreshResult && !("error" in refreshResult && refreshResult.error)) {
      info = refreshResult;
    } else {
      // Fallback to locally cached plan
      info = await planApi.get();
    }

    setPlanInfo(info);
    setStorePlan(info);
    evaluatePlan(info);
  }

  function evaluatePlan(info: PlanInfo) {
    // Free plans never expire
    if (info.plan === "free") {
      setState("ok");
      return;
    }

    if (!info.renewsAt) {
      setState("ok");
      return;
    }

    const now = new Date();
    const renewDate = new Date(info.renewsAt);
    const diffMs = renewDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    setDaysLeft(diffDays);

    if (diffDays < 0) {
      // Expired
      setState("expired");
    } else if (diffDays <= 5) {
      // Warning zone (5, 3, 1 days)
      setState("warning");
    } else {
      setState("ok");
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    const result = await planApi.refresh();
    if (result && !("error" in result && result.error)) {
      setPlanInfo(result);
      evaluatePlan(result);
      showToast("Plan status updated");
    } else {
      showToast("Could not reach server. Connect to the internet and try again.", "error");
    }
    setRefreshing(false);
  }

  async function handleLogout() {
    await auth.logout();
    setSession(null);
  }

  function handleManageBilling() {
    window.api?.openExternal("https://worshiphq.app/app/settings?tab=billing");
  }

  // Still checking
  if (state === "checking") {
    return (
      <div className="flex h-full items-center justify-center bg-base">
        <div className="text-center">
          <Loader2 className="mx-auto size-8 text-primary-bright whq-spin" />
          <p className="mt-3 text-sm text-ink-muted">Checking subscription...</p>
        </div>
      </div>
    );
  }

  // Expired — full lock
  if (state === "expired") {
    return (
      <div className="flex h-full items-center justify-center bg-base p-8">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 grid size-20 place-items-center rounded-2xl bg-danger/10">
            <ShieldAlert className="size-10 text-danger" />
          </div>
          <h1 className="text-2xl font-bold text-ink">Subscription Expired</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Your <span className="font-semibold capitalize">{planInfo?.plan}</span> plan expired
            {daysLeft !== null && <> {Math.abs(daysLeft)} day{Math.abs(daysLeft) !== 1 ? "s" : ""} ago</>}.
            Renew your subscription to continue using the app.
          </p>

          <div className="mt-6 space-y-3">
            <button onClick={handleManageBilling} className="btn-primary w-full py-2.5 text-sm font-semibold">
              <ExternalLink className="size-4" />
              Manage Billing Online
            </button>
            <button onClick={handleRefresh} disabled={refreshing} className="btn-ghost w-full py-2.5 text-sm">
              {refreshing ? <Loader2 className="size-4 whq-spin" /> : <Wifi className="size-4" />}
              {refreshing ? "Checking..." : "I've Renewed — Check Again"}
            </button>
            <button onClick={handleLogout} className="btn-ghost w-full py-2 text-xs text-ink-faint">
              Log Out
            </button>
          </div>

          <p className="mt-6 text-[11px] text-ink-faint">
            Your data is safe. Renew your plan to regain access.
          </p>
        </div>
      </div>
    );
  }

  // Warning banner (5/3/1 days before expiry)
  if (state === "warning" && !dismissed) {
    const urgency = daysLeft !== null && daysLeft <= 1;
    return (
      <div className="flex h-full flex-col">
        <div className={`flex items-center gap-3 px-4 py-3 text-sm ${urgency ? "bg-danger/10 text-danger" : "bg-gold/10 text-gold"}`}>
          {urgency ? <AlertTriangle className="size-4 shrink-0" /> : <Clock className="size-4 shrink-0" />}
          <span className="flex-1 font-medium">
            Your <span className="capitalize">{planInfo?.plan}</span> plan renews in {daysLeft} day{daysLeft !== 1 ? "s" : ""}.
            {urgency ? " Renew now to avoid losing access." : " Make sure your payment method is up to date."}
          </span>
          <button onClick={handleManageBilling} className="rounded-lg bg-white/80 px-3 py-1 text-xs font-bold text-ink hover:bg-white">
            Manage Billing
          </button>
          <button onClick={() => setDismissed(true)} className="rounded-lg px-2 py-1 text-xs font-medium hover:bg-white/30">
            Dismiss
          </button>
        </div>
        {children}
      </div>
    );
  }

  // All good — render children normally
  return <>{children}</>;
}
