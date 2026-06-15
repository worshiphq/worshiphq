"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { ChurchLogo } from "@/components/app/church-logo";
import { nav } from "@/config/nav";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/demo/data";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function Sidebar({ role, churchName, churchLogo }: { role: Role; churchName: string; churchLogo?: string | null }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" : pathname.startsWith(href);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface/40 transition-all duration-300 lg:flex",
        collapsed ? "w-[4.5rem]" : "w-64",
      )}
    >
      <div className={cn("flex h-16 items-center border-b border-line px-4", collapsed && "justify-center px-0")}>
        <ChurchLogo logo={churchLogo} name={churchName} collapsed={collapsed} />
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {nav.map((section, i) => {
          const items = section.items.filter((it) => can(role, it.key) || it.key === "dashboard");
          if (!items.length) return null;
          return (
            <div key={i}>
              {section.title && !collapsed && (
                <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  {section.title}
                </div>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                        active ? "text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      {active && (
                        <span className="absolute inset-0 rounded-xl border border-primary/30 bg-primary/10" />
                      )}
                      {active && (
                        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary-bright" />
                      )}
                      <item.icon
                        className={cn("relative size-[1.15rem] shrink-0", active && "text-primary-bright")}
                      />
                      {!collapsed && <span className="relative flex-1">{item.label}</span>}
                      {!collapsed && item.badge && (
                        <Badge variant="gold" className="relative px-1.5 py-0 text-[10px]">
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-3 border-t border-line px-4 py-3.5 text-sm text-ink-muted hover:text-ink"
      >
        {collapsed ? <PanelLeft className="size-5" /> : <PanelLeftClose className="size-5" />}
        {!collapsed && "Collapse"}
      </button>
    </aside>
  );
}
