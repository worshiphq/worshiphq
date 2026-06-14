import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/app/app-shell";
import { TourProvider } from "@/components/app/tour";
import { getActiveAnnouncements } from "@/lib/data/announcements";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [branches, announcements, church] = await Promise.all([
    db.branch.findMany({
      where: { churchId: session.churchId },
      orderBy: { isHQ: "desc" },
      select: { id: true, name: true, isHQ: true },
    }),
    getActiveAnnouncements(),
    db.church.findUnique({ where: { id: session.churchId }, select: { suspended: true } }),
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
    <AppShell session={session} branches={branches} announcements={announcements}>
      <TourProvider>{children}</TourProvider>
    </AppShell>
  );
}
