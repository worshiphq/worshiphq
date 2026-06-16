import Link from "next/link";
import {
  Users, CalendarCheck2, HandCoins, MessageSquare, Cake, ArrowRight,
  UserPlus, Send, CalendarPlus, Heart, Clock, TrendingUp, ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { TrendAreaChart, AttendanceBarChart, MembershipDonut } from "@/components/app/charts";
import { SyncStatus } from "@/components/app/offline-indicator";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MemberAvatar } from "@/components/ui/member-avatar";
import { requireSession } from "@/lib/auth";
import { getDashboard } from "@/lib/data/dashboard";
import { formatDate } from "@/lib/utils";
import { DashboardAnimations } from "@/components/app/dashboard-animations";
import { QuickAddMenu } from "@/components/app/quick-add-menu";
import { PageTips } from "@/components/app/page-tips";

const quickActions = [
  { icon: UserPlus, label: "Add member", href: "/app/people", section: "people", color: "bg-primary/10 text-primary-bright" },
  { icon: HandCoins, label: "Record gift", href: "/app/giving", section: "giving", color: "bg-gold/10 text-gold" },
  { icon: Send, label: "Send SMS", href: "/app/communications", section: "communications", color: "bg-info/10 text-info" },
  { icon: CalendarPlus, label: "New event", href: "/app/events", section: "events", color: "bg-success/10 text-success" },
];

export default async function DashboardPage() {
  const session = await requireSession();
  const { kpis, trend, todaysBirthdays, events, careTasks, recentMembers, departmentBreakdown } = await getDashboard(session.churchId);
  const has = (m: string) => session.sections.includes(m);
  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <DashboardAnimations>
      <PageTips
        tourId="dashboard"
        steps={[
          { target: "quick-add", title: "Quick add", body: "Jump straight to adding a member, recording a gift, taking attendance or sending an SMS." },
          { target: "dash-kpis", title: "Your church at a glance", body: "Live totals for members, weekly attendance, giving and message reach — updated as you work." },
          { target: "dash-quick-actions", title: "Common tasks", body: "One-tap shortcuts to the things you do most often." },
        ]}
      />
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {greeting}, {session.name.split(" ")[0]} <span className="inline-block animate-[wave_1.8s_ease-in-out_infinite] origin-[70%_70%]">👋</span>
            </h1>
            <p className="mt-1 text-sm text-ink-muted">Today is {today}</p>
          </div>
          <div className="flex items-center gap-2">
            <SyncStatus />
            <QuickAddMenu />
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div data-tour="dash-kpis" data-animate="stagger" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {has("people") && <KPICard label="Active members" value={kpis.activeMembers} icon={Users} trend={12} color="primary" />}
          {has("attendance") && <KPICard label="Weekly attendance" value={kpis.weeklyAttendance} icon={CalendarCheck2} trend={5} color="success" />}
          {has("giving") && <KPICard label="Monthly giving" value={kpis.monthlyGiving} prefix="₵" icon={HandCoins} trend={8} color="gold" />}
          {has("communications") && <KPICard label="Message reach" value={kpis.messageReach} icon={MessageSquare} trend={-3} color="info" />}
        </div>

        {/* ── Quick actions ── */}
        <div data-tour="dash-quick-actions" data-animate="stagger" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quickActions.filter((a) => has(a.section)).map((a) => (
            <Link key={a.label} href={a.href}>
              <div className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/25 hover:shadow-md cursor-pointer">
                <span className={`grid size-10 place-items-center rounded-xl ${a.color} transition-transform duration-200 group-hover:scale-110`}>
                  <a.icon className="size-5" />
                </span>
                <span className="text-sm font-medium">{a.label}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* ── Charts row ── */}
        {(has("giving") || has("attendance")) && (
          <div className="grid gap-4 lg:grid-cols-3">
            {has("giving") && (
              <Card className="lg:col-span-2" data-animate="fade">
                <div className="flex items-center justify-between p-5 pb-0">
                  <div>
                    <h3 className="font-display text-lg font-semibold">Giving trend</h3>
                    <p className="text-xs text-ink-muted">Monthly giving over the last 6 months</p>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                    <TrendingUp className="size-3" /> +8.2%
                  </span>
                </div>
                <div className="p-3"><TrendAreaChart data={trend} /></div>
              </Card>
            )}

            {has("attendance") && (
              <Card className={has("giving") ? "" : "lg:col-span-3"} data-animate="fade">
                <div className="p-5 pb-0">
                  <h3 className="font-display text-lg font-semibold">Attendance</h3>
                  <p className="text-xs text-ink-muted">Records logged by month</p>
                </div>
                <div className="p-3"><AttendanceBarChart data={trend} /></div>
              </Card>
            )}
          </div>
        )}

        {/* ── Membership Summary + Recent Members ── */}
        {has("people") && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card data-animate="fade">
            <div className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold">Membership</h3>
                <span className="text-2xl font-bold text-primary-bright">{kpis.activeMembers}</span>
              </div>
              <p className="text-xs text-ink-muted">Total active members</p>
              <div className="mt-4">
                <MembershipDonut data={departmentBreakdown} />
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-2" data-animate="fade">
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="font-display text-lg font-semibold">Recent members</h3>
              <Link href="/app/people" className="flex items-center gap-1 text-xs font-medium text-primary-bright hover:underline">
                View all <ChevronRight className="size-3" />
              </Link>
            </div>
            <div className="px-3 pb-3">
              {recentMembers.length === 0 && <p className="px-2 py-6 text-center text-sm text-ink-faint">No members yet.</p>}
              <div className="space-y-1">
                {recentMembers.map((m) => (
                  <div key={m.name} className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2/60">
                    <div className="flex items-center gap-3">
                      <MemberAvatar name={m.name} gender={m.gender} size="sm" />
                      <div>
                        <div className="text-sm font-medium">{m.name}</div>
                        <div className="text-xs text-ink-faint">{m.department ?? "No department"}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-ink-muted">{m.status}</div>
                      <div className="text-[10px] text-ink-faint">{m.joined}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
        )}

        {/* ── Bottom row: Birthdays, Events, Care ── */}
        <div className="grid gap-4 lg:grid-cols-3">
          {has("people") && (
          <Card data-animate="fade">
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                <span className="grid size-8 place-items-center rounded-lg bg-gold/10"><Cake className="size-4 text-gold" /></span>
                Celebrations
              </h3>
            </div>
            <div className="space-y-1 px-3 pb-3">
              {todaysBirthdays.length === 0 && <p className="px-2 py-6 text-center text-sm text-ink-faint">No birthdays today.</p>}
              {todaysBirthdays.map((p) => (
                <div key={p.name} className="flex items-center justify-between rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2/60">
                  <div className="flex items-center gap-3">
                    <MemberAvatar name={p.name} size="sm" />
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-ink-faint">Birthday today</div>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="text-gold"><Send className="size-3.5" /></Button>
                </div>
              ))}
            </div>
          </Card>
          )}

          {has("events") && (
          <Card data-animate="fade">
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                <span className="grid size-8 place-items-center rounded-lg bg-primary/10"><Clock className="size-4 text-primary-bright" /></span>
                Upcoming
              </h3>
              <Link href="/app/events" className="text-xs text-primary-bright hover:underline">View all</Link>
            </div>
            <div className="space-y-1 px-3 pb-3">
              {events.length === 0 && <p className="px-2 py-6 text-center text-sm text-ink-faint">No upcoming events.</p>}
              {events.map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2/60">
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-gradient-to-br from-surface-2 to-surface text-center shadow-sm">
                    <div>
                      <span className="block font-display text-sm font-bold leading-none">{new Date(e.date).getDate()}</span>
                      <span className="text-[9px] uppercase text-ink-faint">{formatDate(e.date, { month: "short", day: undefined, year: undefined })}</span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{e.title}</div>
                    <div className="text-xs text-ink-faint">{e.time}</div>
                  </div>
                  <ChevronRight className="size-4 text-ink-faint" />
                </div>
              ))}
            </div>
          </Card>
          )}

          {has("people") && (
          <Card data-animate="fade">
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                <span className="grid size-8 place-items-center rounded-lg bg-danger/10"><Heart className="size-4 text-danger" /></span>
                Follow-up
              </h3>
            </div>
            <div className="space-y-1 px-3 pb-3">
              {careTasks.length === 0 && <p className="px-2 py-6 text-center text-sm text-ink-faint">No follow-ups right now.</p>}
              {careTasks.map((t) => (
                <div key={t.id} className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2/60">
                  <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${t.priority === "high" ? "bg-danger" : t.priority === "medium" ? "bg-warning" : "bg-ink-faint"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t.person}</div>
                    <div className="text-xs text-ink-muted">{t.reason}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-faint">{t.due}</span>
                </div>
              ))}
            </div>
          </Card>
          )}
        </div>
      </div>
    </DashboardAnimations>
  );
}

function KPICard({
  label, value, prefix, icon: Icon, trend, color,
}: {
  label: string; value: number; prefix?: string; icon: typeof Users; trend: number; color: string;
}) {
  const up = trend >= 0;
  const colorMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary-bright",
    success: "bg-success/10 text-success",
    gold: "bg-gold/10 text-gold",
    info: "bg-info/10 text-info",
  };
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/20 hover:shadow-md">
      {/* Subtle glow on hover */}
      <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-primary/5 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
      <div className="relative flex items-start justify-between">
        <div>
          <span className="text-xs font-medium text-ink-muted">{label}</span>
          <div className="mt-2 font-display text-3xl font-bold tracking-tight">
            {prefix}{typeof value === "number" ? value.toLocaleString() : value}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium ${up ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
              <TrendingUp className={`size-3 ${!up ? "rotate-180" : ""}`} />
              {Math.abs(trend)}%
            </span>
            <span className="text-ink-faint">vs last month</span>
          </div>
        </div>
        <span className={`grid size-11 place-items-center rounded-xl ${colorMap[color] ?? colorMap.primary}`}>
          <Icon className="size-5" />
        </span>
      </div>
    </div>
  );
}
