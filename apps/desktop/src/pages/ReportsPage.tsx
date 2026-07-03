import { useEffect, useState } from "react";
import {
  Users, HandCoins, CalendarCheck2, TrendingUp, TrendingDown, Minus,
  Loader2, UserPlus, Receipt, PiggyBank, Users2,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, cn } from "../lib/utils";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
    const lastMonthD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthD.getFullYear()}-${String(lastMonthD.getMonth() + 1).padStart(2, "0")}`;

    const [
      totalMembers, newThisMonth, newLastMonth, visitors, groups,
      giveThis, giveLast, expThis, expLast, attThis, attLast,
      monthlyGiving, monthlyExpenses, monthlyAttendance,
    ] = await Promise.all([
      db.rawQuery("SELECT COUNT(*) as c FROM person WHERE church_id = ?", [cid]),
      db.rawQuery("SELECT COUNT(*) as c FROM person WHERE church_id = ? AND substr(joined_at, 1, 7) = ?", [cid, thisMonth]),
      db.rawQuery("SELECT COUNT(*) as c FROM person WHERE church_id = ? AND substr(joined_at, 1, 7) = ?", [cid, lastMonth]),
      db.rawQuery("SELECT COUNT(*) as c FROM visitor WHERE church_id = ? AND substr(created_at, 1, 7) = ?", [cid, thisMonth]),
      db.rawQuery('SELECT COUNT(*) as c FROM "group" WHERE church_id = ?', [cid]),
      db.rawQuery("SELECT COALESCE(SUM(amount),0) as t FROM gift WHERE church_id = ? AND substr(date,1,7) = ?", [cid, thisMonth]),
      db.rawQuery("SELECT COALESCE(SUM(amount),0) as t FROM gift WHERE church_id = ? AND substr(date,1,7) = ?", [cid, lastMonth]),
      db.rawQuery("SELECT COALESCE(SUM(amount),0) as t FROM expense WHERE church_id = ? AND substr(date,1,7) = ?", [cid, thisMonth]),
      db.rawQuery("SELECT COALESCE(SUM(amount),0) as t FROM expense WHERE church_id = ? AND substr(date,1,7) = ?", [cid, lastMonth]),
      db.rawQuery("SELECT COALESCE(SUM(adults+teens+children+visitors),0) as t, COUNT(*) as sessions FROM attendance_session WHERE church_id = ? AND substr(date,1,7) = ?", [cid, thisMonth]),
      db.rawQuery("SELECT COALESCE(SUM(adults+teens+children+visitors),0) as t FROM attendance_session WHERE church_id = ? AND substr(date,1,7) = ?", [cid, lastMonth]),
      db.rawQuery("SELECT substr(date,1,7) as month, SUM(amount) as total FROM gift WHERE church_id = ? GROUP BY substr(date,1,7)", [cid]),
      db.rawQuery("SELECT substr(date,1,7) as month, SUM(amount) as total FROM expense WHERE church_id = ? GROUP BY substr(date,1,7)", [cid]),
      db.rawQuery("SELECT substr(date,1,7) as month, SUM(adults+teens+children+visitors) as total, COUNT(*) as sessions FROM attendance_session WHERE church_id = ? GROUP BY substr(date,1,7)", [cid]),
    ]);

    // build 6-month buckets
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: MONTH_ABBR[d.getMonth()] });
    }
    const sumByMonth = (rows: any[]) => {
      const m = new Map(rows.map((r) => [r.month, Number(r.total || 0)]));
      return months.map((mo) => ({ label: mo.label, value: m.get(mo.key) || 0 }));
    };
    const avgAttByMonth = () => {
      const m = new Map<string, { total: number; sessions: number }>(monthlyAttendance.map((r: any) => [r.month, { total: Number(r.total || 0), sessions: Number(r.sessions || 0) }]));
      return months.map((mo) => {
        const v = m.get(mo.key);
        return { label: mo.label, value: v && v.sessions > 0 ? Math.round(v.total / v.sessions) : 0 };
      });
    };

    setData({
      totalMembers: totalMembers[0]?.c || 0,
      newThisMonth: newThisMonth[0]?.c || 0,
      newLastMonth: newLastMonth[0]?.c || 0,
      visitors: visitors[0]?.c || 0,
      groups: groups[0]?.c || 0,
      giveThis: giveThis[0]?.t || 0, giveLast: giveLast[0]?.t || 0,
      expThis: expThis[0]?.t || 0, expLast: expLast[0]?.t || 0,
      attThis: attThis[0]?.t || 0, attThisSessions: attThis[0]?.sessions || 0, attLast: attLast[0]?.t || 0,
      givingByMonth: sumByMonth(monthlyGiving),
      expensesByMonth: sumByMonth(monthlyExpenses),
      attendanceByMonth: avgAttByMonth(),
    });
    setLoading(false);
  }

  if (loading) {
    return (
      <PageShell title="Reports">
        <div className="flex items-center justify-center py-24"><Loader2 className="size-8 text-primary-bright whq-spin" /></div>
      </PageShell>
    );
  }
  if (!data) return null;

  const netThisMonth = data.giveThis - data.expThis;
  const maxDual = Math.max(...data.givingByMonth.map((d: any) => d.value), ...data.expensesByMonth.map((d: any) => d.value), 1);
  const maxAtt = Math.max(...data.attendanceByMonth.map((d: any) => d.value), 1);
  const maxGiving = Math.max(...data.givingByMonth.map((d: any) => d.value), 1);

  return (
    <PageShell title="Reports">
      <PageHeader title="Reports & Analytics" description="Church growth, giving trends, and attendance analytics." />

      {/* KPI row */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total members" value={data.totalMembers} icon={Users} color="text-primary-bright" />
        <CompareStat label="Income this month" value={formatCurrency(data.giveThis)} current={data.giveThis} previous={data.giveLast} icon={HandCoins} accent="text-success" iconBg="bg-success/10 text-success" />
        <CompareStat label="Expenses this month" value={formatCurrency(data.expThis)} current={data.expThis} previous={data.expLast} icon={Receipt} accent="text-danger" iconBg="bg-danger/10 text-danger" />
        <div className="card group relative p-5 transition-colors hover:border-primary/30">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-muted">{netThisMonth >= 0 ? "Net surplus" : "Net deficit"}</span>
            <span className={cn("grid size-9 place-items-center rounded-lg border border-line bg-surface-2", netThisMonth >= 0 ? "text-success" : "text-danger")}>
              <PiggyBank className="size-4" />
            </span>
          </div>
          <div className={cn("mt-3 text-3xl font-bold tracking-tight", netThisMonth >= 0 ? "text-success" : "text-danger")}>{formatCurrency(Math.abs(netThisMonth))}</div>
        </div>
        <CompareStat label="New members" value={String(data.newThisMonth)} current={data.newThisMonth} previous={data.newLastMonth} icon={UserPlus} accent="text-info" iconBg="bg-info/10 text-info" />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Income vs expenses dual chart */}
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-bold text-ink">Income vs expenses (6 months)</h3>
          <div className="flex h-40 items-end gap-2">
            {data.givingByMonth.map((inc: any, i: number) => {
              const exp = data.expensesByMonth[i] ?? { value: 0 };
              const incH = Math.max((inc.value / maxDual) * 100, 2);
              const expH = Math.max((exp.value / maxDual) * 100, 2);
              return (
                <div key={inc.label} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full items-end justify-center gap-0.5" style={{ height: "100%" }}>
                    <div className="w-[45%] rounded-t-sm bg-success" style={{ height: `${incH}%` }} />
                    <div className="w-[45%] rounded-t-sm bg-danger/70" style={{ height: `${expH}%` }} />
                  </div>
                  <span className="text-[10px] text-ink-faint">{inc.label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs">
            <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm bg-success" /> Income</span>
            <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm bg-danger/70" /> Expenses</span>
          </div>
        </div>

        {/* Avg attendance per service */}
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-bold text-ink">Avg. attendance per service (6 months)</h3>
          <div className="flex h-40 items-end gap-2">
            {data.attendanceByMonth.map((m: any) => {
              const h = Math.max((m.value / maxAtt) * 100, 4);
              return (
                <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-info">{m.value || ""}</span>
                  <div className="w-full rounded-t-lg bg-gradient-to-t from-info/30 to-info/60 transition-all" style={{ height: `${h}%` }} />
                  <span className="text-[10px] text-ink-faint">{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Giving trend */}
      <div className="card mt-4 p-5">
        <h3 className="mb-4 text-sm font-bold text-ink">Giving trend (6 months)</h3>
        <div className="flex h-32 items-end gap-2">
          {data.givingByMonth.map((m: any) => {
            const h = Math.max((m.value / maxGiving) * 100, 4);
            return (
              <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-success">{formatCurrency(m.value)}</span>
                <div className="w-full rounded-t-lg bg-gradient-to-t from-success/30 to-success/60 transition-all" style={{ height: `${h}%` }} />
                <span className="text-[10px] text-ink-faint">{m.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer stats */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="card flex items-center gap-3 p-4">
          <Users2 className="size-5 text-primary-bright" />
          <div><p className="text-lg font-bold text-ink">{data.groups}</p><p className="text-xs text-ink-muted">Active groups</p></div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <UserPlus className="size-5 text-primary-bright" />
          <div><p className="text-lg font-bold text-ink">{data.visitors}</p><p className="text-xs text-ink-muted">Visitors this month</p></div>
        </div>
      </div>
    </PageShell>
  );
}

function CompareStat({ label, value, current, previous, icon: Icon, accent, iconBg }: {
  label: string; value: string; current: number; previous: number; icon: any; accent: string; iconBg: string;
}) {
  let indicator: React.ReactNode;
  if (previous === 0 && current === 0) indicator = <span className="flex items-center gap-0.5 text-[11px] text-ink-faint"><Minus className="size-3" /> No change</span>;
  else if (previous === 0) indicator = <span className="flex items-center gap-0.5 text-[11px] text-success"><TrendingUp className="size-3" /> New</span>;
  else {
    const pct = Math.round(((current - previous) / previous) * 100);
    if (pct > 0) indicator = <span className="flex items-center gap-0.5 text-[11px] text-success"><TrendingUp className="size-3" /> +{pct}%</span>;
    else if (pct < 0) indicator = <span className="flex items-center gap-0.5 text-[11px] text-danger"><TrendingDown className="size-3" /> {pct}%</span>;
    else indicator = <span className="flex items-center gap-0.5 text-[11px] text-ink-faint"><Minus className="size-3" /> No change</span>;
  }
  return (
    <div className="card group relative p-5 transition-colors hover:border-primary/30">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-muted">{label}</span>
        <span className={cn("grid size-9 place-items-center rounded-lg border border-line bg-surface-2", iconBg)}><Icon className="size-4" /></span>
      </div>
      <div className={cn("mt-3 text-3xl font-bold tracking-tight", accent)}>{value}</div>
      <div className="mt-2">{indicator}</div>
    </div>
  );
}
