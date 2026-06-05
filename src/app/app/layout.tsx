import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/app/app-shell";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return <AppShell session={session}>{children}</AppShell>;
}
