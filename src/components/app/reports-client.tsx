"use client";

import { useRouter } from "next/navigation";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
  Users, TrendingUp, TrendingDown, HandCoins, UserRoundPlus, Minus, Receipt, PiggyBank, Users2,
} from "lucide-react";
import { compactNumber } from "@/lib/utils";

type ChartPoint = { label: string; value: number };
type NamedCount = { name: string; count: number };
type NamedValue = { name: string; value: number };

const PALETTE = ["#0d9488", "#6366F1", "#E5B567", "#F472B6", "#60A5FA", "#34D399", "#F59E0B", "#94A3B8"];

const tooltipStyle = {
  background: "var(--color-surface, #fff)", border: "1px solid var(--color-line, #e8e2d6)",
  borderRadius: 12, fontSize: 12, boxShadow: "0 12px 30px -12px rgba(60,50,30,0.25)",
} as const;

function formatGHS(n: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 }).format(n);
}

function ChangeIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <span className="flex items-center gap-0.5 text-xs text-ink-faint"><Minus className="size-3" /> No change</span>;
  if (previous === 0) return <span className="flex items-center gap-0.5 text-xs text-success"><TrendingUp className="size-3" /> New</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return <span className="flex items-center gap-0.5 text-xs text-success"><TrendingUp className="size-3" /> +{pct}%</span>;
  if (pct < 0) return <span className="flex items-center gap-0.5 text-xs text-danger"><TrendingDown className="size-3" /> {pct}%</span>;
  return <span className="flex items-center gap-0.5 text-xs text-ink-faint"><Minus className="size-3" /> No change</span>;
}

function StatCard({ icon: Icon, tone, value, label, current, previous }: {
  icon: typeof Users; tone: string; value: string | number; label: string; current?: number; previous?: number;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${tone}1a` }}>
          <Icon className="size-5" style={{ color: tone }} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-2xl font-bold">{value}</p>
          <p className="text-xs text-ink-muted">{label}</p>
          {current !== undefined && previous !== undefined && <ChangeIndicator current={current} previous={previous} />}
        </div>
      </div>
    </Card>
  );
}

function DonutBlock({ data, currency }: { data: NamedValue[]; currency?: boolean }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  if (data.length === 0) return <Empty />;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <ResponsiveContainer width={160} height={160}>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={50} outerRadius={74} paddingAngle={2} stroke="none">
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => (currency ? formatGHS(Number(v)) : Number(v).toLocaleString())} />
        </PieChart>
      </ResponsiveContainer>
      <div className="w-full flex-1 space-y-1.5">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-ink-muted">
              <span className="size-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              {d.name}
            </span>
            <span className="font-medium tabular-nums">
              {currency ? formatGHS(d.value) : d.value}
              <span className="ml-1 text-xs text-ink-faint">{Math.round((d.value / total) * 100)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty() {
  return <div className="grid h-40 place-items-center text-sm text-ink-faint">No data yet</div>;
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-ink-faint">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

export function ReportsClient({
  span, stats, givingByMonth, expensesByMonth, attendanceByMonth,
  membersByMonth, attendanceBreakdown, genderSplit, ageGroups, fundSplit,
}: {
  span: number;
  stats: {
    totalMembers: number; newMembersThisMonth: number; newMembersLastMonth: number;
    givingThisMonth: number; givingLastMonth: number; expensesThisMonth: number;
    expensesLastMonth: number; groupCount: number; visitorCount: number;
  };
  givingByMonth: ChartPoint[];
  expensesByMonth: ChartPoint[];
  attendanceByMonth: ChartPoint[];
  membersByMonth: ChartPoint[];
  attendanceBreakdown: NamedCount[];
  genderSplit: NamedCount[];
  ageGroups: NamedCount[];
  fundSplit: NamedValue[];
}) {
  const router = useRouter();
  const netThisMonth = stats.givingThisMonth - stats.expensesThisMonth;
  const rangeLabel = `Last ${span} months`;

  // Merge income + expenses into one series for the combo chart.
  const cashflow = givingByMonth.map((g, i) => ({
    label: g.label, income: g.value, expenses: expensesByMonth[i]?.value ?? 0,
  }));

  return (
    <div className="mt-5 space-y-6">
      {/* Range toggle */}
      <div className="flex items-center justify-end gap-1 rounded-xl border border-line bg-surface p-1 sm:w-fit sm:ml-auto">
        {[6, 12].map((m) => (
          <button
            key={m}
            onClick={() => router.push(`/app/reports?months=${m}`)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${span === m ? "bg-brand text-white" : "text-ink-muted hover:bg-surface-2"}`}
          >
            {m} months
          </button>
        ))}
      </div>

      {/* Headline stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={Users} tone="#6366F1" value={stats.totalMembers} label="Total members" />
        <StatCard icon={HandCoins} tone="#0d9488" value={formatGHS(stats.givingThisMonth)} label="Income this month" current={stats.givingThisMonth} previous={stats.givingLastMonth} />
        <StatCard icon={Receipt} tone="#EF4444" value={formatGHS(stats.expensesThisMonth)} label="Expenses this month" current={stats.expensesThisMonth} previous={stats.expensesLastMonth} />
        <StatCard icon={PiggyBank} tone={netThisMonth >= 0 ? "#16A34A" : "#EF4444"} value={formatGHS(Math.abs(netThisMonth))} label={netThisMonth >= 0 ? "Net surplus" : "Net deficit"} />
        <StatCard icon={UserRoundPlus} tone="#0EA5E9" value={stats.newMembersThisMonth} label="New members" current={stats.newMembersThisMonth} previous={stats.newMembersLastMonth} />
      </div>

      {/* Membership growth + attendance trend */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Membership growth" subtitle={rangeLabel}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={membersByMonth} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="rg-members" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366F1" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line, #eee)" vertical={false} />
              <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [Number(v).toLocaleString(), "Members"]} />
              <Area type="monotone" dataKey="value" stroke="#6366F1" strokeWidth={2.5} fill="url(#rg-members)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Average attendance per service" subtitle={rangeLabel}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={attendanceByMonth} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line, #eee)" vertical={false} />
              <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [Number(v).toLocaleString(), "Attendance"]} />
              <Line type="monotone" dataKey="value" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 3, fill: "#0d9488" }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Income vs expenses */}
      <ChartCard title="Income vs expenses" subtitle={rangeLabel}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={cashflow} margin={{ top: 10, right: 8, left: -6, bottom: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line, #eee)" vertical={false} />
            <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `₵${compactNumber(v)}`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, k) => [formatGHS(Number(v)), k === "income" ? "Income" : "Expenses"]} cursor={{ fill: "rgba(99,102,241,0.06)" }} />
            <Bar dataKey="income" radius={[5, 5, 0, 0]} fill="#0d9488" />
            <Bar dataKey="expenses" radius={[5, 5, 0, 0]} fill="#F87171" />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 flex items-center justify-center gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#0d9488]" /> Income</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#F87171]" /> Expenses</span>
        </div>
      </ChartCard>

      {/* People breakdowns */}
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Members by gender"><DonutBlock data={genderSplit.map((g) => ({ name: g.name, value: g.count }))} /></ChartCard>
        <ChartCard title="Giving by fund" subtitle={rangeLabel}><DonutBlock data={fundSplit} currency /></ChartCard>
        <ChartCard title="Attendance mix" subtitle={rangeLabel}><DonutBlock data={attendanceBreakdown.map((a) => ({ name: a.name, value: a.count }))} /></ChartCard>
      </div>

      {/* Age groups */}
      <ChartCard title="Members by age group" subtitle="Based on recorded dates of birth">
        {ageGroups.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ageGroups} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line, #eee)" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} interval={0} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [Number(v).toLocaleString(), "Members"]} cursor={{ fill: "rgba(99,102,241,0.06)" }} />
              <Bar dataKey="count" radius={[5, 5, 0, 0]}>
                {ageGroups.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Small stats */}
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard icon={Users2} tone="#6366F1" value={stats.groupCount} label="Active groups" />
        <StatCard icon={UserRoundPlus} tone="#0EA5E9" value={stats.visitorCount} label="Visitors this month" />
      </div>
    </div>
  );
}
