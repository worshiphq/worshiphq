"use client";

import { useState, useTransition } from "react";
import { Search, Bell, ChevronDown, Check, LogOut, Settings, Building2, Menu, UserCircle, UserPlus, UserRoundPlus, HandCoins, CalendarCheck2 } from "lucide-react";
import { MemberAvatar } from "@/components/ui/member-avatar";
import { Badge } from "@/components/ui/badge";
import { OfflineIndicator } from "@/components/app/offline-indicator";
import { switchBranch, signOut } from "@/app/actions/auth";
import type { Session } from "@/lib/permissions";
import type { AppNotification } from "@/lib/data/notifications";
import { cn } from "@/lib/utils";

type BranchLite = { id: string; name: string; isHQ: boolean };

const NOTIF_ICON = {
  member: UserPlus,
  visitor: UserRoundPlus,
  gift: HandCoins,
  attendance: CalendarCheck2,
} as const;

export function Topbar({
  session,
  branches,
  notifications = [],
  onMenu,
}: {
  session: Session;
  branches: BranchLite[];
  notifications?: AppNotification[];
  onMenu: () => void;
}) {
  const [branchOpen, setBranchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [pending, start] = useTransition();
  const [activeBranch, setActiveBranch] = useState(session.branch);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-base/80 px-4 backdrop-blur-xl">
      <button onClick={onMenu} className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 lg:hidden">
        <Menu className="size-5" />
      </button>

      {/* Branch switcher */}
      <div className="relative">
        <button
          onClick={() => setBranchOpen((v) => !v)}
          className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium hover:border-line"
        >
          <Building2 className="size-4 text-primary-bright" />
          <span className="max-w-[8rem] truncate">{activeBranch}</span>
          <ChevronDown className="size-4 text-ink-muted" />
        </button>
        {branchOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setBranchOpen(false)} />
            <div className="absolute left-0 top-12 z-20 w-60 rounded-xl border border-line bg-elevated p-1.5 shadow-2xl">
              <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                Switch branch
              </div>
              {branches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setActiveBranch(b.name);
                    setBranchOpen(false);
                    start(() => switchBranch(b.name));
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2"
                >
                  <span className="flex items-center gap-2">
                    {b.name}
                    {b.isHQ && <Badge variant="primary" className="px-1.5 py-0 text-[9px]">HQ</Badge>}
                  </span>
                  {activeBranch === b.name && <Check className="size-4 text-primary-bright" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Search */}
      <div className="relative hidden flex-1 md:block">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input
          placeholder="Search members, gifts, events…"
          className="h-10 w-full max-w-md rounded-xl border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <OfflineIndicator />

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative grid size-10 place-items-center rounded-xl border border-line bg-surface text-ink-muted hover:text-ink"
          >
            <Bell className="size-[1.15rem]" />
            {notifications.length > 0 && (
              <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-primary-bright ring-2 ring-base" />
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-12 z-20 w-80 rounded-xl border border-line bg-elevated p-2 shadow-2xl">
                <div className="px-2.5 py-1.5 text-sm font-semibold">Notifications</div>
                {notifications.length === 0 ? (
                  <div className="px-2.5 py-4 text-center text-sm text-ink-faint">No recent activity</div>
                ) : (
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.map((n) => {
                      const Icon = NOTIF_ICON[n.type];
                      return (
                        <div key={n.id} className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-surface-2">
                          <Icon className="mt-0.5 size-4 shrink-0 text-primary-bright" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-ink">{n.text}</div>
                            <div className="text-xs text-ink-faint">{formatTimeAgo(n.time)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className={cn("flex items-center gap-2 rounded-xl border border-line bg-surface p-1 pr-2.5", pending && "opacity-60")}
          >
            <MemberAvatar name={session.avatarName} photoUrl={session.avatarUrl} size="sm" />
            <span className="hidden text-left sm:block">
              <span className="block text-xs font-medium leading-tight">{session.name}</span>
              <span className="block text-[10px] leading-tight text-ink-muted">{session.customRole ?? session.role}</span>
            </span>
            <ChevronDown className="size-4 text-ink-muted" />
          </button>
          {profileOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
              <div className="absolute right-0 top-12 z-20 w-56 rounded-xl border border-line bg-elevated p-1.5 shadow-2xl">
                <div className="border-b border-line px-2.5 py-2">
                  <div className="text-sm font-medium">{session.name}</div>
                  <div className="text-xs text-ink-muted">{session.email}</div>
                </div>
                <a href="/app/account" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2">
                  <UserCircle className="size-4" /> My account
                </a>
                {session.sections.includes("settings") && (
                  <a href="/app/settings" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2">
                    <Settings className="size-4" /> Settings
                  </a>
                )}
                <form action={signOut}>
                  <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-danger hover:bg-danger/10">
                    <LogOut className="size-4" /> Sign out
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
