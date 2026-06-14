import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WorshipHQ Admin",
  robots: { index: false, follow: false },
};

// Minimal wrapper. Auth is enforced per-page via requireSuperAdmin() so the
// /admin/login route can render without redirecting to itself.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#0c1116] text-slate-100">{children}</div>;
}
