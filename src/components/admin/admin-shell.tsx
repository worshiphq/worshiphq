import Link from "next/link";
import { LayoutDashboard, FileText, Megaphone, LogOut, CreditCard, Wallet, Undo2, DatabaseBackup, KeyRound, TrendingUp, Mail, Receipt, Users, UserCog, Menu } from "lucide-react";
import { superAdminSignOut } from "@/app/actions/admin";

const GROUPS: { title: string; items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] }[] = [
  {
    title: "Platform",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/accounts", label: "Accounts", icon: Users },
      { href: "/admin/outreach", label: "Outreach", icon: Mail },
      { href: "/admin/broadcast", label: "Broadcast", icon: Megaphone },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/admin/pricing", label: "Pricing", icon: CreditCard },
      { href: "/admin/revenue", label: "Revenue", icon: TrendingUp },
      { href: "/admin/payments", label: "Payments", icon: Wallet },
      { href: "/admin/refunds", label: "Refunds", icon: Undo2 },
      { href: "/admin/receipts", label: "Receipts", icon: Receipt },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/admin/content", label: "Site content", icon: FileText },
      { href: "/admin/backups", label: "Backups", icon: DatabaseBackup },
      { href: "/admin/access", label: "Access log", icon: KeyRound },
      { href: "/admin/team", label: "Admin team", icon: UserCog },
    ],
  },
];

/** The WorshipHQ logo sits on a white tile, because the logo is dark on white. */
function Brand() {
  return (
    <Link href="/admin" className="block rounded-xl bg-white px-3 py-2 transition-opacity hover:opacity-90" aria-label="WorshipHQ admin home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo2.png" alt="WorshipHQ" className="h-9 w-auto" />
    </Link>
  );
}

function NavLinks() {
  return (
    <nav aria-label="Admin" className="space-y-5">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.title}</div>
          <div className="space-y-0.5">
            {g.items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                <n.icon className="size-4 shrink-0 text-slate-400" />
                {n.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SignOut() {
  return (
    <form action={superAdminSignOut}>
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
      >
        <LogOut className="size-4" />
        Sign out
      </button>
    </form>
  );
}

export function AdminShell({
  children,
}: {
  /** Kept so existing pages do not need to change. Not shown. */
  email?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="lg:flex">
      {/* Sidebar on large screens */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-white/10 bg-[#0a0e13] p-4 lg:flex">
        <Brand />
        <div className="flex-1"><NavLinks /></div>
        <SignOut />
      </aside>

      {/* Menu on small screens */}
      <header className="border-b border-white/10 bg-[#0a0e13] px-4 py-3 lg:hidden">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <Brand />
            <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 group-open:bg-white/5">
              <Menu className="size-4" /> Menu
            </span>
          </summary>
          <div className="mt-4 space-y-4 pb-2">
            <NavLinks />
            <SignOut />
          </div>
        </details>
      </header>

      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
          <main id="main-content" tabIndex={-1} className="outline-none [color-scheme:dark] [&_option]:bg-slate-800 [&_option]:text-slate-100">{children}</main>
        </div>
      </div>
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
