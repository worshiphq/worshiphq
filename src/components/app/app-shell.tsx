"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { Logo } from "@/components/brand/logo";
import { nav } from "@/config/nav";
import { can, type Session } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function AppShell({ session, children }: { session: Session; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh bg-base">
      <Sidebar role={session.role} />

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
                <Logo href="/app" />
                <button onClick={() => setMobileOpen(false)} className="grid size-9 place-items-center rounded-lg text-ink-muted">
                  <X className="size-5" />
                </button>
              </div>
              <nav className="flex-1 space-y-5 overflow-y-auto p-3">
                {nav.map((section, i) => {
                  const items = section.items.filter((it) => can(session.role, it.key) || it.key === "dashboard");
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
        <Topbar session={session} onMenu={() => setMobileOpen(true)} />
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
