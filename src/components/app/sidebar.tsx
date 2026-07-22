"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { PanelLeftClose, PanelLeft, Lock } from "lucide-react";
import { ChurchLogo } from "@/components/app/church-logo";
import { nav, navSection } from "@/config/nav";
import { hasSection } from "@/lib/permissions";
import { routeAllowedByPlan, getRouteFeature, planHasFeature, type PlanId, type PlanTable } from "@/lib/plan-gate";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function Sidebar({ sections, exactSections, churchName, churchLogo, plan = "free", planTable }: { sections: string[]; exactSections?: boolean; churchName: string; churchLogo?: string | null; plan?: PlanId; planTable?: PlanTable }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [prevPlan, setPrevPlan] = useState<PlanId | null>(null);

  useEffect(() => {
    const ts = localStorage.getItem("whq_plan_upgraded");
    const prev = localStorage.getItem("whq_prev_plan") as PlanId | null;
    if (ts && Date.now() - Number(ts) < 7 * 24 * 60 * 60 * 1000 && prev) {
      setPrevPlan(prev);
    }
  }, []);

  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" : pathname.startsWith(href);

  const isNewlyUnlocked = (href: string) => {
    if (!prevPlan) return false;
    const feature = getRouteFeature(href);
    if (!feature) return false;
    return planHasFeature(plan, feature, planTable) && !planHasFeature(prevPlan, feature, planTable);
  };

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
          const items = section.items.filter((it) => hasSection({ sections, exactSections }, navSection(it)));
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
                  const locked = !routeAllowedByPlan(plan, item.href, planTable);
                  return (
                    <Link
                      key={item.href}
                      href={locked ? "/app/settings?tab=billing" : item.href}
                      prefetch={true}
                      title={collapsed ? item.label + (locked ? " (upgrade)" : "") : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                        locked
                          ? "text-ink-faint/50 hover:bg-surface-2"
                          : active ? "text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      {active && !locked && (
                        <span className="absolute inset-0 rounded-xl border border-primary/30 bg-primary/10" />
                      )}
                      {active && !locked && (
                        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary-bright" />
                      )}
                      <item.icon
                        className={cn("relative size-[1.15rem] shrink-0", active && !locked && "text-primary-bright", locked && "opacity-40")}
                      />
                      {!collapsed && <span className={cn("relative flex-1", locked && "opacity-40")}>{item.label}</span>}
                      {!collapsed && locked && (
                        <Lock className="relative size-3 text-ink-faint/60" />
                      )}
                      {!collapsed && !locked && isNewlyUnlocked(item.href) && (
                        <span className="whq-new-tag relative ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-500 bg-red-500/10">
                          NEW
                        </span>
                      )}
                      {!collapsed && !locked && !isNewlyUnlocked(item.href) && item.badge && (
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
