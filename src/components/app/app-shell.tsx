"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, ShieldCheck, Megaphone, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { ChurchLogo } from "@/components/app/church-logo";
import { nav } from "@/config/nav";
import { hasSection, type Session } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { themeFromAccent } from "@/lib/color";
import { exitImpersonation } from "@/app/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActiveAnnouncement } from "@/lib/data/announcements";
import type { AppNotification } from "@/lib/data/notifications";
import type { CSSProperties } from "react";

export function AppShell({
  session,
  announcements = [],
  notifications = [],
  churchLogo = null,
  accentColor = null,
  children,
}: {
  session: Session;
  announcements?: ActiveAnnouncement[];
  notifications?: AppNotification[];
  churchLogo?: string | null;
  accentColor?: string | null;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Swipe-right gesture to open mobile sidebar
  const touchRef = useRef<{ startX: number; startY: number } | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch.clientX < 30) touchRef.current = { startX: touch.clientX, startY: touch.clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchRef.current.startX;
    const dy = Math.abs(touch.clientY - touchRef.current.startY);
    if (dx > 60 && dy < 100) setMobileOpen(true);
    touchRef.current = null;
  };

  // Apply the church's accent as theme CSS variables so the whole dashboard
  // follows their brand colour. Falls back to the default teal in globals.css.
  const themeStyle: CSSProperties = {};
  if (accentColor) {
    const t = themeFromAccent(accentColor);
    Object.assign(themeStyle, {
      "--color-primary": t.primary,
      "--color-primary-bright": t.bright,
      "--color-primary-soft": t.soft,
    });
  }

  return (
    <div className="flex min-h-dvh bg-base lg:touch-none" style={themeStyle} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <Sidebar sections={session.sections} churchName={session.churchName} churchLogo={churchLogo} />

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-surface lg:hidden"
            >
              <div className="flex h-16 items-center justify-between border-b border-line px-4">
                <ChurchLogo logo={churchLogo} name={session.churchName} />
                <button onClick={() => setMobileOpen(false)} className="grid size-9 place-items-center rounded-lg text-ink-muted">
                  <X className="size-5" />
                </button>
              </div>
              <nav className="flex-1 space-y-5 overflow-y-auto p-3">
                {nav.map((section, i) => {
                  const items = section.items.filter((it) => hasSection(session, it.key));
                  if (!items.length) return null;
                  return (
                    <div key={i}>
                      {section.title && (
                        <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                          {section.title}
                        </div>
                      )}
                      {items.map((item) => {
                        const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
                        return (
                          <Link
                            key={item.key}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                              active ? "border border-primary/30 bg-primary/10 text-ink" : "text-ink-muted",
                            )}
                          >
                            <item.icon className={cn("size-5", active && "text-primary-bright")} />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  );
                })}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar session={session} notifications={notifications} onMenu={() => setMobileOpen(true)} />
        {session.impersonating && <ImpersonationBanner churchName={session.churchName} />}
        {session.isDemo && <DemoBanner />}
        {announcements.map((a) => (
          <AnnouncementBanner key={a.id} announcement={a} />
        ))}
        <main className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function DemoBanner() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-gold/30 bg-gold-soft px-4 py-2 text-center text-xs text-gold">
      <span className="font-medium">You&rsquo;re exploring the read-only demo.</span>
      <Link href="/sign-up" className="font-semibold underline underline-offset-2">
        Create your free church account →
      </Link>
    </div>
  );
}

function ImpersonationBanner({ churchName }: { churchName: string }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-teal-500/30 bg-teal-500/10 px-4 py-2 text-center text-xs text-teal-700">
      <span className="flex items-center gap-1.5 font-medium">
        <ShieldCheck className="size-3.5" />
        Support mode — viewing {churchName}. The church cannot see you.
      </span>
      <form action={exitImpersonation}>
        <SubmitButton
          variant="ghost"
          size="sm"
          overlay
          pendingLabel="Returning…"
          className="h-auto bg-transparent px-0 py-0 font-semibold text-teal-700 underline underline-offset-2 shadow-none hover:bg-transparent"
        >
          Return to admin →
        </SubmitButton>
      </form>
    </div>
  );
}

const ANNOUNCEMENT_STYLES: Record<string, { wrap: string; icon: typeof Megaphone }> = {
  info: { wrap: "border-sky-500/30 bg-sky-500/10 text-sky-700", icon: Megaphone },
  warning: { wrap: "border-amber-500/30 bg-amber-500/10 text-amber-700", icon: AlertTriangle },
  success: { wrap: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700", icon: CheckCircle2 },
};

function AnnouncementBanner({ announcement }: { announcement: ActiveAnnouncement }) {
  const style = ANNOUNCEMENT_STYLES[announcement.level] ?? ANNOUNCEMENT_STYLES.info;
  const Icon = style.icon;
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b px-4 py-2 text-center text-xs", style.wrap)}>
      <Icon className="size-3.5 shrink-0" />
      <span className="font-semibold">{announcement.title}</span>
      <span className="opacity-90">{announcement.body}</span>
    </div>
  );
}
