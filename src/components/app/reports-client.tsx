"use client";

import { Card } from "@/components/ui/card";
import {
  Users, TrendingUp, TrendingDown, HandCoins, Users2, UserRoundPlus, Minus,
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

export function ReportsClient({
  stats,
  givingByMonth,
  attendanceByMonth,
}: {
  stats: {
    totalMembers: number;
    newMembersThisMonth: number;
    newMembersLastMonth: number;
    givingThisMonth: number;
    givingLastMonth: number;
    groupCount: number;
    visitorCount: number;
  };
  givingByMonth: ChartPoint[];
  attendanceByMonth: ChartPoint[];
}) {
  return (
    <div className="mt-5 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              <TrendingUp className="size-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.newMembersThisMonth}</p>
              <p className="text-xs text-ink-muted">New this month</p>
              <ChangeIndicator current={stats.newMembersThisMonth} previous={stats.newMembersLastMonth} />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-warning/10">
              <HandCoins className="size-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatGHS(stats.givingThisMonth)}</p>
              <p className="text-xs text-ink-muted">Giving this month</p>
              <ChangeIndicator current={stats.givingThisMonth} previous={stats.givingLastMonth} />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-info/10">
              <UserRoundPlus className="size-5 text-info" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.visitorCount}</p>
              <p className="text-xs text-ink-muted">Visitors this month</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold">Giving trend (6 months)</h3>
          <BarChart data={givingByMonth} currency />
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold">Avg. attendance per service (6 months)</h3>
          <BarChart data={attendanceByMonth} />
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-3 p-4">
          <Users2 className="size-5 text-brand" />
          <div>
            <p className="text-lg font-bold">{stats.groupCount}</p>
            <p className="text-xs text-ink-muted">Active groups</p>
          </div>
        </Card>

        <Card className="flex items-center gap-3 p-4">
          <HandCoins className="size-5 text-brand" />
          <div>
            <p className="text-lg font-bold">{formatGHS(stats.givingThisMonth + stats.givingLastMonth)}</p>
            <p className="text-xs text-ink-muted">Last 2 months total giving</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
