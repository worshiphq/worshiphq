import Link from "next/link";
import {
  Users,
  CalendarCheck2,
  HandCoins,
  MessageSquare,
  Cake,
  ArrowRight,
  Plus,
  UserPlus,
  Send,
  CalendarPlus,
  Heart,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { TrendAreaChart, AttendanceBarChart } from "@/components/app/charts";
import { SyncStatus } from "@/components/app/offline-indicator";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { requireSession } from "@/lib/auth";
import { getDashboard } from "@/lib/data/dashboard";
import { formatDate } from "@/lib/utils";

const quickActions = [
  { icon: UserPlus, label: "Add member", href: "/app/people" },
  { icon: HandCoins, label: "Record gift", href: "/app/giving" },
  { icon: Send, label: "Send SMS", href: "/app/communications" },
  { icon: CalendarPlus, label: "New event", href: "/app/events" },
];

export default async function DashboardPage() {
  const session = await requireSession();
  const { kpis, trend, todaysBirthdays, events, careTasks } = await getDashboard(session.churchId);
  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <PageHeader title={`${greeting}, ${session.name.split(" ")[0]} 👋`} description={`Here's what's happening at ${session.churchName} today.`}>
        <SyncStatus />
        <Button size="sm"><Plus /> Quick add</Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active members" value={kpis.activeMembers} icon={Users} />
        <StatCard label="Weekly attendance" value={kpis.weeklyAttendance} icon={CalendarCheck2} />
        <StatCard label="Monthly giving" value={kpis.monthlyGiving} prefix="₵" icon={HandCoins} />
        <StatCard label="Message reach" value={kpis.messageReach} icon={MessageSquare} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickActions.map((a) => (
          <Link key={a.label} href={a.href}>
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary-bright"><a.icon className="size-5" /></span>
              <span className="text-sm font-medium">{a.label}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between p-5 pb-0">
            <div>
              <h3 className="font-display text-lg font-semibold">Giving trend</h3>
              <p className="text-sm text-ink-muted">Monthly giving over the last 6 months</p>
            </div>
          </div>
          <div className="p-3"><TrendAreaChart data={trend} /></div>
        </Card>

        <Card>
          <div className="p-5 pb-0">
            <h3 className="font-display text-lg font-semibold">Attendance</h3>
            <p className="text-sm text-ink-muted">Records logged by month</p>
          </div>
          <div className="p-3"><AttendanceBarChart data={trend} /></div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between p-5 pb-3">
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Cake className="size-5 text-gold" /> Today&rsquo;s celebrations</h3>
          </div>
          <div className="space-y-1 px-3 pb-3">
            {todaysBirthdays.length === 0 && <p className="px-2 py-4 text-sm text-ink-faint">No birthdays today.</p>}
            {todaysBirthdays.map((p) => (
              <div key={p.name} className="flex items-center justify-between rounded-xl px-2 py-2 hover:bg-surface-2">
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} size="sm" />
                  <div><div className="text-sm font-medium">{p.name}</div><div className="text-xs text-ink-faint">Birthday 🎂</div></div>
                </div>
                <Button size="sm" variant="ghost" className="text-gold"><Send className="size-3.5" /> Bless</Button>
              </div>
            ))}
            {todaysBirthdays.length > 0 && (
              <div className="mx-2 mt-2 rounded-xl bg-gold-soft px-3 py-2 text-xs text-gold">Birthday SMS blessings are sent automatically at 7:00 AM.</div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between p-5 pb-3">
            <h3 className="font-display text-lg font-semibold">Upcoming events</h3>
            <Link href="/app/events" className="text-xs text-primary-bright hover:underline">View all</Link>
          </div>
          <div className="space-y-1 px-3 pb-3">
            {events.length === 0 && <p className="px-2 py-4 text-sm text-ink-faint">No upcoming events yet.</p>}
            {events.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-center">
                  <span className="font-display text-sm font-bold leading-none">{new Date(e.date).getDate()}</span>
                  <span className="text-[9px] uppercase text-ink-faint">{formatDate(e.date, { month: "short", day: undefined, year: undefined })}</span>
                </div>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{e.title}</div><div className="text-xs text-ink-faint">{e.time}</div></div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between p-5 pb-3">
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Heart className="size-5 text-danger" /> Care & follow-up</h3>
          </div>
          <div className="space-y-1 px-3 pb-3">
            {careTasks.length === 0 && <p className="px-2 py-4 text-sm text-ink-faint">No follow-ups right now. 🎉</p>}
            {careTasks.map((t) => (
              <div key={t.id} className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${t.priority === "high" ? "bg-danger" : t.priority === "medium" ? "bg-warning" : "bg-ink-faint"}`} />
                <div className="min-w-0 flex-1"><div className="text-sm font-medium">{t.person}</div><div className="text-xs text-ink-muted">{t.reason}</div></div>
                <span className="shrink-0 text-xs text-ink-faint">{t.due}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 flex justify-center">
        <Link href="/app/people"><Button variant="ghost">Explore your congregation <ArrowRight className="size-4" /></Button></Link>
      </div>
    </div>
  );
}
