import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Users, CalendarCheck2, HandCoins, CalendarDays,
  HandHelping, Wallet, Wheat, Settings, UserRoundPlus,
  ClipboardList, Heart, Users2, Target, BarChart3, Cake,
  Megaphone, BookUser, Calendar, BookMarked, Package, Receipt,
  DoorOpen, BookHeart, Sparkles, HeartHandshake, PiggyBank,
  CalendarClock, Crown, Sun, MessageSquare, BellRing, ScrollText,
  PanelLeftClose, PanelLeft, RefreshCw, Loader2, Baby,
} from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../stores/app-store";
import { sync } from "../lib/api";
import { cn } from "../lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: any;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Reports", href: "/reports", icon: BarChart3 },
    ],
  },
  {
    title: "Congregation",
    items: [
      { label: "People", href: "/people", icon: Users },
      { label: "Leaders", href: "/leaders", icon: Crown },
      { label: "Attendance", href: "/attendance", icon: CalendarCheck2 },
      { label: "Events", href: "/events", icon: CalendarDays },
      { label: "Calendar", href: "/calendar", icon: Calendar },
      { label: "Volunteers", href: "/volunteers", icon: HandHelping },
      { label: "Groups", href: "/groups", icon: Users2 },
      { label: "Visitors", href: "/visitors", icon: UserRoundPlus },
      { label: "Children & Teens", href: "/children", icon: Baby },
      { label: "Birthdays", href: "/birthdays", icon: Cake },
      { label: "Directory", href: "/directory", icon: BookUser },
      { label: "Bookings", href: "/bookings", icon: DoorOpen },
      { label: "Rosters", href: "/rosters", icon: CalendarClock },
    ],
  },
  {
    title: "Finance & Giving",
    items: [
      { label: "Accounting", href: "/accounting", icon: Wallet },
      { label: "Giving", href: "/giving", icon: HandCoins },
      { label: "Day Born", href: "/dayborn", icon: Sun },
      { label: "Pledges", href: "/pledges", icon: Target },
      { label: "Harvest", href: "/harvest", icon: Wheat },
      { label: "Expenses", href: "/expenses", icon: Receipt },
      { label: "Budgets", href: "/budgets", icon: PiggyBank },
      { label: "Welfare", href: "/welfare", icon: HandHelping },
    ],
  },
  {
    title: "Engagement",
    items: [
      { label: "Communications", href: "/communications", icon: MessageSquare },
      { label: "Reminders", href: "/reminders", icon: BellRing },
      { label: "Follow-ups", href: "/follow-ups", icon: ClipboardList },
      { label: "Prayer Requests", href: "/prayer-requests", icon: Heart },
      { label: "Notices", href: "/notices", icon: Megaphone },
      { label: "Sermons", href: "/sermons", icon: BookMarked },
      { label: "Devotionals", href: "/devotionals", icon: BookHeart },
      { label: "Testimonies", href: "/testimonies", icon: Sparkles },
      { label: "Counseling", href: "/counseling", icon: HeartHandshake },
    ],
  },
  {
    title: "Organisation",
    items: [
      { label: "Assets", href: "/assets", icon: Package },
      { label: "Audit Log", href: "/audit-log", icon: ScrollText },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const { session, sidebarCollapsed, toggleSidebar, syncOverlay, syncStatus, setSyncStatus } = useAppStore();
  const collapsed = sidebarCollapsed;
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    if (syncing || syncOverlay.visible) return;
    setSyncing(true);
    const result = await sync.now();
    setSyncStatus(result);
    setSyncing(false);
  }

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-line bg-surface/40 transition-all duration-300",
        collapsed ? "w-[4.5rem]" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-line px-3 py-3">
        {session?.churchLogoUrl ? (
          <img
            src={session.churchLogoUrl}
            alt=""
            className="size-8 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft">
            <img src="./icon.png" alt="" className="size-5 object-contain" />
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-ink">{session?.churchName || "WorshipHQ"}</p>
            <p className="truncate text-[10px] text-ink-faint">{session?.userName}</p>
          </div>
        )}
        <button onClick={toggleSidebar} className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-faint hover:bg-surface-3 hover:text-ink-muted">
          {collapsed ? <PanelLeft className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-4" : ""}>
            {section.title && !collapsed && (
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                {section.title}
              </p>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === "/"}
                className={({ isActive }) =>
                  cn(
                    "group relative mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300",
                    isActive
                      ? "text-ink"
                      : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                  )
                }
                title={collapsed ? item.label : undefined}
              >
                {({ isActive }: { isActive: boolean }) => (
                  <>
                    {isActive && (
                      <>
                        <span className="absolute inset-0 rounded-xl border border-primary/30 bg-primary/10" />
                        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary-bright" />
                      </>
                    )}
                    <item.icon className="relative size-[1.15rem] shrink-0" />
                    {!collapsed && <span className="relative truncate">{item.label}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Sync button */}
      <div className="border-t border-line px-2 py-2">
        <button
          onClick={handleSync}
          disabled={syncing || syncOverlay.visible}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
            syncing || syncOverlay.visible
              ? "bg-primary-soft text-primary-bright"
              : "text-ink-muted hover:bg-primary-soft hover:text-primary-bright"
          )}
          title={collapsed ? "Sync Now" : undefined}
        >
          {syncing || syncOverlay.visible ? (
            <Loader2 className="size-4 shrink-0 whq-spin" />
          ) : (
            <RefreshCw className="size-4 shrink-0" />
          )}
          {!collapsed && (
            <div className="min-w-0 flex-1 text-left">
              <span>{syncing || syncOverlay.visible ? "Syncing..." : "Sync Now"}</span>
              {syncStatus.lastSyncAt && !syncing && (
                <p className="text-[10px] text-ink-faint truncate">
                  Last: {new Date(syncStatus.lastSyncAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          )}
          {!collapsed && syncStatus.pendingChanges > 0 && (
            <span className="ml-auto rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-gold">
              {syncStatus.pendingChanges}
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
