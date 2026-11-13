import { countryFromName } from "@/lib/countries";
import { PhoneDefaults } from "@/components/ui/phone-input";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getChurchChrome } from "@/lib/church-chrome";
import { AppShell } from "@/components/app/app-shell";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { TourProvider } from "@/components/app/tour";
import { AmountPrivacy } from "@/components/app/amount-privacy";
import { RecycleBinProvider } from "@/components/app/recycle-bin-provider";
import { binCutoff } from "@/lib/recycle-bin";
import { getActiveAnnouncements } from "@/lib/data/announcements";
import { getRecentNotifications } from "@/lib/data/notifications";
import { getChurchPlan, getChurchSub } from "@/lib/plan-gate-server";
import { commsTrialOf, paidPlan } from "@/lib/plan-gate";
import { BillingBanner } from "@/components/app/billing-banner";
import { TrialBanner } from "@/components/app/trial-banner";
import { TrialProvider, TrialWelcome } from "@/components/app/trial-context";
import { getTrialAccess } from "@/lib/trials";
import { NavProgress } from "@/components/app/nav-progress";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // Real users must have verified at least one channel (phone or email) before
  // using the app. Teammates invited by SMS still get gated to phone verify.
  if (!session.isDemo && !session.impersonating && !session.phoneVerified && !session.emailVerified) {
    redirect("/verify-phone");
  }

  const [announcements, church, notifications, plan, platformConfig, binCount, trialAccess, subRow] = await Promise.all([
    getActiveAnnouncements(),
    getChurchChrome(session.churchId),
    getRecentNotifications(session.churchId),
    getChurchPlan(session.churchId),
    getPlatformConfig(),
    // Admins see the whole bin; anyone else only the items from sections they manage.
    !session.canDelete ? Promise.resolve(0)
      : session.role === "Owner" || session.role === "Admin" ? countRecycleBin(session.churchId)
      : import("@/app/actions/recycle-bin").then((m) => m.getRecycleBinCount()),
    session.isDemo || session.impersonating ? Promise.resolve(null) : getTrialAccess(session.churchId),
    getChurchSub(session.churchId),
  ]);

  // During a free month of Communications (switched on by SuperAdmin), a Free church's sidebar shows SMS as open.
  const comms = commsTrialOf(subRow, platformConfig.trials.comms.enabled);
  const trialOn = plan === "free" && comms.active;
  // The plan badge beside the bell: only the Main Admin and Admins see the plan and its renewal.
  const showPlan = !session.isDemo && (session.role === "Owner" || session.role === "Admin");
  const billing = showPlan
    ? {
      plan: paidPlan(subRow),
      status: subRow?.status ?? "active",
      renewsAt: subRow?.renewsAt?.toISOString() ?? null,
      autoRenew: !!subRow?.autoRenew,
      cancelAtPeriodEnd: !!subRow?.cancelAtPeriodEnd,
    }
    : null;
  const planTable = trialOn
    ? { ...platformConfig.planTable, free: { ...platformConfig.planTable.free, features: [...platformConfig.planTable.free.features, "sms"] } }
    : platformConfig.planTable;

  // Suspended churches are locked out - but SuperAdmin support can still enter.
  if (church?.suspended && !session.impersonating) {
    return (
      <div className="grid min-h-dvh place-items-center bg-base px-4">
        <div className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
          <h1 className="font-display text-xl font-bold text-ink">Account suspended</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Your church account is temporarily suspended. Please contact WorshipHQ support to restore access.
          </p>
        </div>
      </div>
    );
  }
  // A running trial: the sidebar must not unlock what the trial holds back, and what the trial adds is marked as trial.
  const heldBack = new Set(trialAccess?.withheld ?? []);
  const tablePlan = heldBack.size ? { ...planTable, [plan]: { ...planTable[plan], features: planTable[plan].features.filter((f) => !heldBack.has(f)) } } : planTable;
  return (
    <TrialProvider value={{ plan: trialAccess?.plan ?? null, features: trialAccess?.usable ?? [], startedAt: trialAccess?.startedAt ?? null, endsAt: trialAccess?.endsAt ?? null, daysLeft: trialAccess?.daysLeft ?? 0, commsDaysLeft: trialOn ? comms.daysLeft : null, billing }}>
    <TrialWelcome />
    <AppShell
      session={session}
      announcements={announcements}
      notifications={notifications}
      churchLogo={church?.logoUrl ?? null}
      accentColor={church?.accentColor ?? null}
      plan={plan}
      planTable={tablePlan}
    >
      <NavProgress />
      <RecycleBinProvider canManage={session.canDelete} initialCount={binCount}>
        <TourProvider>
          <PhoneDefaults country={countryFromName(church?.country)}>
            <AmountPrivacy enabled={church?.hideAmounts ?? false}>
              {/* Only the Main Admin can renew, so only they are nagged. */}
              {session.role === "Owner" && !session.isDemo && !session.impersonating && <BillingBanner churchId={session.churchId} />}
              {session.role === "Owner" && !session.isDemo && !session.impersonating && <TrialBanner churchId={session.churchId} />}
              {children}
            </AmountPrivacy>
          </PhoneDefaults>
        </TourProvider>
      </RecycleBinProvider>
    </AppShell>
    </TrialProvider>
  );
}

/** Items still in the recycle bin (not yet past their 7 days). */
async function countRecycleBin(churchId: string): Promise<number> {
  const cutoff = binCutoff();
  const [items, rosters] = await Promise.all([
    db.deletedItem.count({ where: { churchId, deletedAt: { gte: cutoff } } }),
    db.volunteerRoster.count({ where: { churchId, deletedAt: { gte: cutoff } } }),
  ]);
  return items + rosters;
}
