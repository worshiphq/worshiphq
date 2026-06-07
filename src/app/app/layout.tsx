import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/app/app-shell";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const branches = await db.branch.findMany({
    where: { churchId: session.churchId },
    orderBy: { isHQ: "desc" },
    select: { id: true, name: true, isHQ: true },
  });
  return (
    <AppShell session={session} branches={branches}>
      {children}
    </AppShell>
  );
}
