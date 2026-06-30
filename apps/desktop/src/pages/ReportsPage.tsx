import { useEffect, useState, useMemo } from "react";
import {
  BarChart3, Users, HandCoins, CalendarCheck2, TrendingUp, TrendingDown,
  Loader2, UserPlus, Wallet, Receipt,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, cn } from "../lib/utils";

export function ReportsPage() {
  const { session, syncVersion } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (session?.churchId) loadReports();
  }, [session?.churchId, syncVersion]);

  async function loadReports() {
    setLoading(true);
    const cid = session!.churchId;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

    const [
      totalMembers, activeMembers, visitors, groups,
      thisMonthGiving, lastMonthGiving,
      thisMonthExpenses, lastMonthExpenses,
      thisMonthAtt, lastMonthAtt,
      monthlyGiving, monthlyAttendance,
    ] = await Promise.all([
      db.rawQuery("SELECT COUNT(*) as c FROM person WHERE church_id = ?", [cid]),
      db.rawQuery("SELECT COUNT(*) as c FROM person WHERE church_id = ? AND status = 'active'", [cid]),
      db.rawQuery("SELECT COUNT(*) as c FROM visitor WHERE church_id = ?", [cid]),
      db.rawQuery('SELECT COUNT(*) as c FROM "group" WHERE church_id = ?', [cid]),
      db.rawQuery(`SELECT COALESCE(SUM(amount), 0) as t FROM gift WHERE church_id = ? AND substr(date, 1, 7) = ?`, [cid, thisMonth]),
      db.rawQuery(`SELECT COALESCE(SUM(amount), 0) as t FROM gift WHERE church_id = ? AND substr(date, 1, 7) = ?`, [cid, lastMonthStr]),
      db.rawQuery(`SELECT COALESCE(SUM(amount), 0) as t FROM expense WHERE church_id = ? AND substr(date, 1, 7) = ?`, [cid, thisMonth]),
      db.rawQuery(`SELECT COALESCE(SUM(amount), 0) as t FROM expense WHERE church_id = ? AND substr(date, 1, 7) = ?`, [cid, lastMonthStr]),
      db.rawQuery(`SELECT COALESCE(SUM(adults + teens + children + visitors), 0) as t, COUNT(*) as sessions FROM attendance_session WHERE church_id = ? AND substr(date, 1, 7) = ?`, [cid, thisMonth]),
      db.rawQuery(`SELECT COALESCE(SUM(adults + teens + children + visitors), 0) as t, COUNT(*) as sessions FROM attendance_session WHERE church_id = ? AND substr(date, 1, 7) = ?`, [cid, lastMonthStr]),
      db.rawQuery(`SELECT substr(date, 1, 7) as month, SUM(amount) as total FROM gift WHERE church_id = ? GROUP BY substr(date, 1, 7) ORDER BY month DESC LIMIT 6`, [cid]),
      db.rawQuery(`SELECT substr(date, 1, 7) as month, SUM(adults + teens + children + visitors) as total, COUNT(*) as sessions FROM attendance_session WHERE church_id = ? GROUP BY substr(date, 1, 7) ORDER BY month DESC LIMIT 6`, [cid]),
    ]);

    setData({
      totalMembers: totalMembers[0]?.c || 0,
      activeMembers: activeMembers[0]?.c || 0,
      visitors: visitors[0]?.c || 0,
      groups: groups[0]?.c || 0,
      thisMonthGiving: thisMonthGiving[0]?.t || 0,
      lastMonthGiving: lastMonthGiving[0]?.t || 0,
      thisMonthExpenses: thisMonthExpenses[0]?.t || 0,
      lastMonthExpenses: lastMonthExpenses[0]?.t || 0,
      thisMonthAtt: thisMonthAtt[0]?.t || 0,
      thisMonthAttSessions: thisMonthAtt[0]?.sessions || 0,
      lastMonthAtt: lastMonthAtt[0]?.t || 0,
      monthlyGiving: monthlyGiving.reverse(),
      monthlyAttendance: monthlyAttendance.reverse(),
    });
    setLoading(false);
  }

  if (loading) {
    return (
      <PageShell title="Reports">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-8 text-primary-bright whq-spin" />
        </div>
      </PageShell>
    );
  }

  if (!data) return null;

  const givingChange = data.lastMonthGiving > 0
    ? Math.round(((data.thisMonthGiving - data.lastMonthGiving) / data.lastMonthGiving) * 100)
    : 0;
  const attChange = data.lastMonthAtt > 0
    ? Math.round(((data.thisMonthAtt - data.lastMonthAtt) / data.lastMonthAtt) * 100)
    : 0;
  const maxGiving = Math.max(...data.monthlyGiving.map((m: any) => m.total || 0), 1);
  const maxAtt = Math.max(...data.monthlyAttendance.map((m: any) => m.total || 0), 1);

  return (
    <PageShell title="Reports">
      <PageHeader title="Reports & Analytics" description="Key metrics and trends at a glance." />

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        <StatCard label="Total Members" value={data.totalMembers} icon={Users} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Active Members" value={data.activeMembers} icon={Users} color="bg-success/10 text-success" />
        <StatCard label="Visitors" value={data.visitors} icon={UserPlus} color="bg-info/10 text-info" />
        <StatCard label="Groups" value={data.groups} icon={Users} color="bg-gold/10 text-gold" />
      </div>

      {/* Comparative cards */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <CompareCard
          label="Giving This Month"
          value={formatCurrency(data.thisMonthGiving)}
          change={givingChange}
          icon={HandCoins}
          color="text-success"
        />
        <CompareCard
          label="Expenses This Month"
          value={formatCurrency(data.thisMonthExpenses)}
          change={data.lastMonthExpenses > 0 ? Math.round(((data.thisMonthExpenses - data.lastMonthExpenses) / data.lastMonthExpenses) * 100) : 0}
          icon={Receipt}
          color="text-danger"
          invertColor
        />
        <CompareCard
          label="Attendance This Month"
          value={String(data.thisMonthAtt)}
          change={attChange}
          icon={CalendarCheck2}
          color="text-info"
          subtitle={`${data.thisMonthAttSessions} service${data.thisMonthAttSessions !== 1 ? "s" : ""}`}
        />
      </div>

      {/* Trend charts (bar-style) */}
      <div className="grid grid-cols-2 gap-4">
        {/* Giving trend */}
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-bold text-ink">Giving Trend (6 months)</h3>
          {data.monthlyGiving.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">No giving data yet</p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {data.monthlyGiving.map((m: any) => {
                const h = Math.max(((m.total || 0) / maxGiving) * 100, 4);
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-success">{formatCurrency(m.total || 0)}</span>
                    <div className="w-full rounded-t-lg bg-gradient-to-t from-success/30 to-success/60 transition-all" style={{ height: `${h}%` }} />
                    <span className="text-[10px] text-ink-faint">{formatMonthLabel(m.month)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Attendance trend */}
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-bold text-ink">Attendance Trend (6 months)</h3>
          {data.monthlyAttendance.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">No attendance data yet</p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {data.monthlyAttendance.map((m: any) => {
                const h = Math.max(((m.total || 0) / maxAtt) * 100, 4);
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-info">{m.total || 0}</span>
                    <div className="w-full rounded-t-lg bg-gradient-to-t from-info/30 to-info/60 transition-all" style={{ height: `${h}%` }} />
                    <span className="text-[10px] text-ink-faint">{formatMonthLabel(m.month)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function CompareCard({ label, value, change, icon: Icon, color, subtitle, invertColor }: {
  label: string; value: string; change: number; icon: any; color: string; subtitle?: string; invertColor?: boolean;
}) {
  const isPositive = invertColor ? change <= 0 : change >= 0;
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("size-4", color)} />
        <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn("text-2xl font-bold", color)}>{value}</p>
      {subtitle && <p className="text-xs text-ink-faint mt-0.5">{subtitle}</p>}
      <div className="mt-2 flex items-center gap-1">
        {change !== 0 ? (
          <>
            {isPositive ? <TrendingUp className="size-3.5 text-success" /> : <TrendingDown className="size-3.5 text-danger" />}
            <span className={cn("text-xs font-bold", isPositive ? "text-success" : "text-danger")}>
              {change > 0 ? "+" : ""}{change}%
            </span>
            <span className="text-xs text-ink-faint">vs last month</span>
          </>
        ) : (
          <span className="text-xs text-ink-faint">—</span>
        )}
      </div>
    </div>
  );
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[parseInt(m, 10) - 1] || m;
}
