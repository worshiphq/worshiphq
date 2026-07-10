import {
  LayoutDashboard,
  Users,
  HandCoins,
  CalendarDays,
  MessageSquare,
  Bell,
  Search,
  TrendingUp,
  Cake,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { givingTrend } from "@/lib/demo/data";

/** A realistic, non-interactive render of the actual WorshipHQ dashboard.
    Used in the hero laptop and feature previews so visitors see the real product. */
export function DashboardMockup() {
  const max = Math.max(...givingTrend.map((d) => d.amount));
  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", active: true },
    { icon: Users, label: "People" },
    { icon: HandCoins, label: "Giving" },
    { icon: CalendarDays, label: "Events" },
    { icon: MessageSquare, label: "Messages" },
  ];

  return (
    <div className="flex h-full w-full overflow-hidden rounded-lg bg-base text-[10px] text-ink">
      {/* Sidebar */}
      <aside className="hidden w-40 shrink-0 flex-col gap-1 border-r border-line bg-surface/60 p-3 sm:flex">
        <div className="mb-3 scale-90 origin-left">
          <Logo href={null} size="sm" />
        </div>
        {navItems.map((n) => (
          <div
            key={n.label}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
              n.active ? "bg-primary/15 text-primary-bright" : "text-ink-muted"
            }`}
          >
            <n.icon className="size-3" />
            {n.label}
          </div>
        ))}
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-ink-faint">
            <Search className="size-2.5" />
            <span>Search members, gifts…</span>
          </div>
          <div className="flex items-center gap-2">
            <Bell className="size-3 text-ink-muted" />
            <div className="size-5 rounded-full bg-gradient-to-br from-primary to-primary-bright" />
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-hidden p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display text-sm font-semibold">Good morning, Pastor</div>
              <div className="text-ink-faint">Main Campus · Sunday overview</div>
            </div>
            <div className="rounded-md bg-primary px-2 py-1 text-[9px] font-semibold text-white">
              + New
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Active members", value: "3,085", trend: "+3.4%" },
              { label: "Attendance", value: "1,485", trend: "+5.3%" },
              { label: "Giving (mo)", value: "$8,400", trend: "+12%" },
            ].map((k) => (
              <div key={k.label} className="card-surface p-2.5">
                <div className="text-ink-faint">{k.label}</div>
                <div className="mt-1 font-display text-sm font-bold">{k.value}</div>
                <div className="mt-0.5 flex items-center gap-0.5 text-[8px] text-success">
                  <TrendingUp className="size-2" />
                  {k.trend}
                </div>
              </div>
            ))}
          </div>

          {/* Chart + side widget */}
          <div className="grid grid-cols-3 gap-2">
            <div className="card-surface col-span-2 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">Giving & attendance</span>
                <span className="text-ink-faint">Last 6 months</span>
              </div>
              <div className="flex h-20 items-end gap-2">
                {givingTrend.map((d) => (
                  <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full items-end justify-center gap-0.5">
                      <div
                        className="w-1/2 rounded-t-sm bg-gradient-to-t from-primary to-primary-bright"
                        style={{ height: `${(d.amount / max) * 64}px` }}
                      />
                      <div
                        className="w-1/2 rounded-t-sm bg-gold/50"
                        style={{ height: `${(d.attendance / 1500) * 64}px` }}
                      />
                    </div>
                    <span className="text-[8px] text-ink-faint">{d.month}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card-surface p-3">
              <div className="mb-2 flex items-center gap-1 font-medium">
                <Cake className="size-3 text-gold" /> Birthdays
              </div>
              <div className="space-y-2">
                {["Sarah T.", "Yaw B.", "Maria S."].map((n, i) => (
                  <div key={n} className="flex items-center gap-1.5">
                    <div
                      className={`size-4 rounded-full bg-gradient-to-br ${
                        ["from-primary to-primary-bright", "from-gold to-[#c9954f]", "from-success to-emerald-600"][i]
                      }`}
                    />
                    <span className="truncate text-ink-muted">{n}</span>
                  </div>
                ))}
                <div className="rounded-md bg-gold/10 px-1.5 py-1 text-[8px] text-gold">
                  3 SMS blessings queued
                </div>
              </div>
            </div>
          </div>

          {/* Recent giving rows */}
          <div className="card-surface p-3">
            <div className="mb-2 font-medium">Recent giving</div>
            <div className="space-y-1.5">
              {[
                ["James Whitfield", "Mobile Money", 200],
                ["Adwoa Sarpong", "Card", 500],
                ["Daniel Park", "Bank transfer", 150],
              ].map(([name, method, amt]) => (
                <div key={name as string} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="size-4 rounded-full bg-surface-2" />
                    <span className="text-ink-muted">{name}</span>
                    <span className="rounded bg-surface-2 px-1 text-[8px] text-ink-faint">{method}</span>
                  </div>
                  <span className="font-medium text-success">${amt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
