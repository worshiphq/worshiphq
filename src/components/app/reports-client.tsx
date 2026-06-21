"use client";

import { Card } from "@/components/ui/card";
import {
  Users, TrendingUp, TrendingDown, HandCoins, Users2, UserRoundPlus, Minus, Receipt, PiggyBank,
} from "lucide-react";

type ChartPoint = { label: string; value: number };

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

function BarChart({ data, currency }: { data: ChartPoint[]; currency?: boolean }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex h-40 items-end gap-2">
      {data.map((d) => {
        const height = Math.max(4, (d.value / max) * 100);
        return (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-medium text-ink-muted">
              {currency ? formatGHS(d.value) : d.value}
            </span>
            <div
              className="w-full rounded-t-md bg-brand transition-all"
              style={{ height: `${height}%` }}
            />
            <span className="text-[10px] text-ink-faint">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function DualBarChart({ income, expenses }: { income: ChartPoint[]; expenses: ChartPoint[] }) {
  const allValues = [...income, ...expenses].map((d) => d.value);
  const max = Math.max(...allValues, 1);

  return (
    <div>
      <div className="flex h-44 items-end gap-2">
        {income.map((inc, i) => {
          const exp = expenses[i] ?? { value: 0 };
          const incH = Math.max(2, (inc.value / max) * 100);
          const expH = Math.max(2, (exp.value / max) * 100);
          return (
            <div key={inc.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full items-end justify-center gap-0.5">
                <div className="w-[45%] rounded-t-sm bg-success" style={{ height: `${incH}%`, minHeight: 4 }} />
                <div className="w-[45%] rounded-t-sm bg-danger/70" style={{ height: `${expH}%`, minHeight: 4 }} />
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
  );
}

export function ReportsClient({
  stats,
  givingByMonth,
  expensesByMonth,
  attendanceByMonth,
}: {
  stats: {
    totalMembers: number;
    newMembersThisMonth: number;
    newMembersLastMonth: number;
    givingThisMonth: number;
    givingLastMonth: number;
    expensesThisMonth: number;
    expensesLastMonth: number;
    groupCount: number;
    visitorCount: number;
  };
  givingByMonth: ChartPoint[];
  expensesByMonth: ChartPoint[];
  attendanceByMonth: ChartPoint[];
}) {
  const netThisMonth = stats.givingThisMonth - stats.expensesThisMonth;

  return (
    <div className="mt-5 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-brand/10">
              <Users className="size-5 text-brand" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalMembers}</p>
              <p className="text-xs text-ink-muted">Total members</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-success/10">
              <HandCoins className="size-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatGHS(stats.givingThisMonth)}</p>
              <p className="text-xs text-ink-muted">Income this month</p>
              <ChangeIndicator current={stats.givingThisMonth} previous={stats.givingLastMonth} />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-danger/10">
              <Receipt className="size-5 text-danger" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatGHS(stats.expensesThisMonth)}</p>
              <p className="text-xs text-ink-muted">Expenses this month</p>
              <ChangeIndicator current={stats.expensesThisMonth} previous={stats.expensesLastMonth} />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl" style={{ background: netThisMonth >= 0 ? "var(--color-success-10, rgba(34,197,94,0.1))" : "var(--color-danger-10, rgba(239,68,68,0.1))" }}>
              <PiggyBank className={`size-5 ${netThisMonth >= 0 ? "text-success" : "text-danger"}`} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${netThisMonth >= 0 ? "text-success" : "text-danger"}`}>{formatGHS(Math.abs(netThisMonth))}</p>
              <p className="text-xs text-ink-muted">{netThisMonth >= 0 ? "Net surplus" : "Net deficit"}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-info/10">
              <UserRoundPlus className="size-5 text-info" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.newMembersThisMonth}</p>
              <p className="text-xs text-ink-muted">New members</p>
              <ChangeIndicator current={stats.newMembersThisMonth} previous={stats.newMembersLastMonth} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold">Income vs expenses (6 months)</h3>
          <DualBarChart income={givingByMonth} expenses={expensesByMonth} />
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold">Avg. attendance per service (6 months)</h3>
          <BarChart data={attendanceByMonth} />
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold">Giving trend (6 months)</h3>
        <BarChart data={givingByMonth} currency />
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-3 p-4">
          <Users2 className="size-5 text-brand" />
          <div>
            <p className="text-lg font-bold">{stats.groupCount}</p>
            <p className="text-xs text-ink-muted">Active groups</p>
          </div>
        </Card>

        <Card className="flex items-center gap-3 p-4">
          <UserRoundPlus className="size-5 text-brand" />
          <div>
            <p className="text-lg font-bold">{stats.visitorCount}</p>
            <p className="text-xs text-ink-muted">Visitors this month</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
