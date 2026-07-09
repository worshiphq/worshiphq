import Link from "next/link";
import { LayoutDashboard, Building2, FileText, Megaphone, LogOut, ShieldCheck, CreditCard, Wallet } from "lucide-react";
import { superAdminSignOut } from "@/app/actions/admin";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/pricing", label: "Pricing", icon: CreditCard },
  { href: "/admin/payments", label: "Payments", icon: Wallet },
  { href: "/admin/content", label: "Site content", icon: FileText },
  { href: "/admin/broadcast", label: "Broadcast", icon: Megaphone },
];

export function AdminShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Top bar */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-teal-500/15 text-teal-400">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight">WorshipHQ Admin</div>
            <div className="text-xs text-slate-500">{email}</div>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              <n.icon className="size-4" />
              <span className="hidden sm:inline">{n.label}</span>
            </Link>
          ))}
          <form action={superAdminSignOut}>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </nav>
      </header>

      {children}
    </div>
  );
}

export function AdminCard({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] ${className}`}>
      {children}
    </div>
  );
}
