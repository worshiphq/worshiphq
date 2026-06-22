import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/app/app-shell";
import { TourProvider } from "@/components/app/tour";
import { getActiveAnnouncements } from "@/lib/data/announcements";
import { getRecentNotifications } from "@/lib/data/notifications";
import { getChurchPlan } from "@/lib/plan-gate";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // Admins/teammates must verify their phone before using the app (real users only).
  if (!session.isDemo && !session.impersonating && session.phoneVerified === false) {
    redirect("/verify-phone");
  }

  const [announcements, church, notifications, plan] = await Promise.all([
    getActiveAnnouncements(),
    db.church.findUnique({
      where: { id: session.churchId },
      select: { suspended: true, logoUrl: true, accentColor: true },
    }),
    getRecentNotifications(session.churchId),
    getChurchPlan(session.churchId),
  ]);

  // Suspended churches are locked out — but SuperAdmin support can still enter.
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
  return (
    <AppShell
      session={session}
      announcements={announcements}
      notifications={notifications}
      churchLogo={church?.logoUrl ?? null}
      accentColor={church?.accentColor ?? null}
      plan={plan}
    >
      <TourProvider>{children}</TourProvider>
    </AppShell>
  );
}
