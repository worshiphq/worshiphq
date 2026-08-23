"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Bell, BellRing, ChevronDown, LogOut, Settings, Menu, UserCircle, UserPlus, UserRoundPlus, HandCoins, CalendarCheck2, Heart, Users2, CalendarDays, Loader2 } from "lucide-react";
import { MemberAvatar } from "@/components/ui/member-avatar";
import { OfflineIndicator } from "@/components/app/offline-indicator";
import { signOut } from "@/app/actions/auth";
import type { Session } from "@/lib/permissions";
import type { AppNotification } from "@/lib/data/notifications";
import type { SearchResult } from "@/app/api/search/route";
import { cn } from "@/lib/utils";

const NOTIF_ICON = {
  member: UserPlus,
  visitor: UserRoundPlus,
  gift: HandCoins,
  attendance: CalendarCheck2,
  prayer: Heart,
} as const;

const RESULT_ICON = { group: Users2, event: CalendarDays, gift: HandCoins } as const;

export function Topbar({
  session,
  notifications = [],
  onMenu,
}: {
  session: Session;
  notifications?: AppNotification[];
  onMenu: () => void;
}) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [pending] = useTransition();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-base/80 px-4 backdrop-blur-xl">
      <button onClick={onMenu} className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 lg:hidden">
        <Menu className="size-5" />
      </button>

      {/* Search */}
      <GlobalSearch />

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
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-sm font-semibold">Notifications</span>
                  <EnableAlerts />
                </div>
                {notifications.length === 0 ? (
                  <div className="px-2.5 py-4 text-center text-sm text-ink-faint">No recent activity</div>
                ) : (
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.map((n) => {
                      const Icon = NOTIF_ICON[n.type];
                      return (
                        <button
                          key={n.id}
                          onClick={() => { setNotifOpen(false); router.push(n.href); }}
                          className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2"
                        >
                          <Icon className="mt-0.5 size-4 shrink-0 text-primary-bright" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-ink">{n.text}</div>
                            <div className="text-xs text-ink-faint">{formatTimeAgo(n.time)}</div>
                          </div>
                        </button>
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

/** Live global search with a results dropdown. */
function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(8000) });
        const data = await r.json();
        setResults(data.results ?? []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 220); // debounce
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (href: string) => { setOpen(false); setQ(""); setResults([]); router.push(href); };

  return (
    <div ref={boxRef} className="relative hidden flex-1 md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search members, groups, events…"
        className="h-10 w-full max-w-md rounded-xl border border-line bg-surface pl-9 pr-8 text-sm text-ink placeholder:text-ink-faint focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-faint" />}

      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 top-12 z-30 w-full max-w-md overflow-hidden rounded-xl border border-line bg-elevated shadow-2xl">
          {results.length === 0 && !loading ? (
            <div className="px-3 py-4 text-center text-sm text-ink-faint">No matches for “{q.trim()}”.</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {results.map((r) => {
                const Icon = r.type === "member" ? null : RESULT_ICON[r.type];
                return (
                  <li key={`${r.type}-${r.id}`}>
                    <button onClick={() => go(r.href)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2">
                      {r.type === "member" ? (
                        <MemberAvatar name={r.label} photoUrl={r.photoUrl} gender={r.gender} size="xs" />
                      ) : (
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-primary-bright">{Icon && <Icon className="size-4" />}</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{r.label}</span>
                        {r.sublabel && <span className="block truncate text-xs text-ink-faint">{r.sublabel}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Ask for browser-notification permission (one-tap). */
function EnableAlerts() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  useEffect(() => {
    if (typeof Notification === "undefined") setPerm("unsupported");
    else setPerm(Notification.permission);
  }, []);

  if (perm === "unsupported" || perm === "granted") return null;
  if (perm === "denied") return <span className="text-[10px] text-ink-faint">Alerts blocked</span>;

  return (
    <button
      onClick={async () => { const p = await Notification.requestPermission(); setPerm(p); }}
      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary-bright hover:bg-primary/20"
    >
      <BellRing className="size-3" /> Enable alerts
    </button>
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
