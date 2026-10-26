"use client";

import { roleLabel } from "@/lib/roles";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Bell, BellRing, ChevronDown, LogOut, Settings, Menu, UserCircle, BookOpen, UserPlus, UserRoundPlus, HandCoins, CalendarCheck2, Heart, Users2, CalendarDays, Loader2 } from "lucide-react";
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
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close a menu on a click anywhere outside it. (A full-screen click-away layer cannot be used here: the header's
  // blur effect turns "fixed" into "inside the header", so such a layer only covered the header bar.)
  useEffect(() => {
    if (!notifOpen && !profileOpen) return;
    const away = (e: MouseEvent) => {
      if (notifOpen && !notifRef.current?.contains(e.target as Node)) setNotifOpen(false);
      if (profileOpen && !profileRef.current?.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [notifOpen, profileOpen]);

  /** Escape closes the menu and puts the keyboard back on its button; tabbing out of the menu closes it too. */
  function menuKey(e: React.KeyboardEvent, which: "notif" | "profile") {
    if (e.key !== "Escape") return;
    e.preventDefault();
    if (which === "notif") setNotifOpen(false); else setProfileOpen(false);
    (which === "notif" ? notifRef : profileRef).current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus();
  }
  function menuBlur(e: React.FocusEvent, which: "notif" | "profile") {
    const wrap = (which === "notif" ? notifRef : profileRef).current;
    if (!wrap?.contains(e.relatedTarget as Node | null)) { if (which === "notif") setNotifOpen(false); else setProfileOpen(false); }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-base/80 px-4 backdrop-blur-xl">
      <button type="button" onClick={onMenu} aria-label="Open menu" className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 lg:hidden">
        <Menu className="size-5" aria-hidden />
      </button>

      {/* Search */}
      <GlobalSearch />

      <div className="ml-auto flex items-center gap-2">
        <OfflineIndicator />

        {/* Notifications */}
        <div className="relative" ref={notifRef} onKeyDown={(e) => menuKey(e, "notif")} onBlur={(e) => menuBlur(e, "notif")}>
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label={notifications.length > 0 ? `Notifications, ${notifications.length} recent` : "Notifications"}
            aria-haspopup="menu"
            aria-expanded={notifOpen}
            className="relative grid size-10 place-items-center rounded-xl border border-line bg-surface text-ink-muted hover:text-ink"
          >
            <Bell className="size-[1.15rem]" aria-hidden />
            {notifications.length > 0 && (
              <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-primary-bright ring-2 ring-base" />
            )}
          </button>
          {notifOpen && (
            <>
              <div role="menu" aria-label="Notifications" className="absolute right-0 top-12 z-20 w-80 rounded-xl border border-line bg-elevated p-2 shadow-2xl">
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-sm font-semibold">Notifications</span>
                  <EnableAlerts />
                </div>
                {notifications.length === 0 ? (
                  <div className="px-2.5 py-4 text-center text-sm text-ink-faint">No recent activity</div>
                ) : (
                  <div className="max-h-80 overflow-y-auto overscroll-contain">
                    {notifications.map((n) => {
                      const Icon = NOTIF_ICON[n.type];
                      return (
                        <button
                          key={n.id}
                          role="menuitem"
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
        <div className="relative" ref={profileRef} onKeyDown={(e) => menuKey(e, "profile")} onBlur={(e) => menuBlur(e, "profile")}>
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            className={cn("flex items-center gap-2 rounded-xl border border-line bg-surface p-1 pr-2.5", pending && "opacity-60")}
          >
            <MemberAvatar name={session.avatarName} photoUrl={session.avatarUrl} size="sm" />
            <span className="hidden text-left sm:block">
              <span className="block text-xs font-medium leading-tight">{session.name}</span>
              <span className="block text-[10px] leading-tight text-ink-muted">{session.customRole ?? roleLabel(session.role)}</span>
            </span>
            <ChevronDown className="size-4 text-ink-muted" aria-hidden />
          </button>
          {profileOpen && (
            <>
              <div role="menu" aria-label="Account" className="absolute right-0 top-12 z-20 w-56 rounded-xl border border-line bg-elevated p-1.5 shadow-2xl">
                <div className="border-b border-line px-2.5 py-2">
                  <div className="text-sm font-medium">{session.name}</div>
                  <div className="text-xs text-ink-muted">{session.email}</div>
                </div>
                <a role="menuitem" href="/app/account" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2">
                  <UserCircle className="size-4" /> My account
                </a>
                <a role="menuitem" href="/docs" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2">
                  <BookOpen className="size-4" /> User manual
                </a>
                {session.sections.includes("settings") && (
                  <a role="menuitem" href="/app/settings" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2">
                    <Settings className="size-4" /> Settings
                  </a>
                )}
                <form action={signOut}>
                  <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-danger hover:bg-danger/10">
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
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => { listRef.current?.children[active]?.scrollIntoView({ block: "nearest" }); }, [active]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(8000) });
        const data = await r.json();
        setResults(data.results ?? []);
        setActive(-1);
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

  const go = (href: string) => { setOpen(false); setQ(""); setResults([]); setActive(-1); router.push(href); };
  const showList = open && q.trim().length >= 2;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (results.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActive((i) => (e.key === "ArrowDown" ? Math.min(i + 1, results.length - 1) : Math.max(i - 1, -1)));
    } else if (e.key === "Enter") {
      const pick = results[active] ?? (results.length === 1 ? results[0] : undefined);
      if (pick) { e.preventDefault(); go(pick.href); }
    } else if (e.key === "Escape") {
      if (showList) { e.preventDefault(); setOpen(false); setActive(-1); }
      else if (q) { e.preventDefault(); setQ(""); }
    }
  }

  return (
    <div ref={boxRef} className="relative hidden flex-1 md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-label="Search members, groups and events"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls="global-search-results"
        aria-activedescendant={showList && results[active] ? `gs-${active}` : undefined}
        placeholder="Search members, groups, events…"
        className="h-10 w-full max-w-md rounded-xl border border-line bg-surface pl-9 pr-8 text-sm text-ink placeholder:text-ink-faint focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-faint" />}

      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 top-12 z-30 w-full max-w-md overflow-hidden rounded-xl border border-line bg-elevated shadow-2xl">
          {results.length === 0 && !loading ? (
            <div className="px-3 py-4 text-center text-sm text-ink-faint">No matches for “{q.trim()}”.</div>
          ) : (
            <ul ref={listRef} id="global-search-results" role="listbox" aria-label="Search results" className="max-h-96 overflow-y-auto overscroll-contain py-1">
              {results.map((r, i) => {
                const Icon = r.type === "member" ? null : RESULT_ICON[r.type];
                return (
                  <li key={`${r.type}-${r.id}`} role="presentation">
                    <button id={`gs-${i}`} role="option" aria-selected={i === active} tabIndex={-1} onClick={() => go(r.href)} className={cn("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2", i === active && "bg-surface-2")}>
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
