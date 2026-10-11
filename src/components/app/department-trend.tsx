"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Trend = {
  sessions: { id: string; serviceName: string; date: string }[];
  groupings: { key: string; label: string; rows: { id: string; name: string; members: number; counts: number[] }[] }[];
};

/** Turnout per department / zone / fellowship across recent checked-in services (latest on the right). */
export function DepartmentTrend({ trend }: { trend: Trend }) {
  const [key, setKey] = useState(trend.groupings[0]?.key ?? "");
  if (trend.sessions.length === 0 || trend.groupings.length === 0) return null;
  const active = trend.groupings.find((g) => g.key === key) ?? trend.groupings[0];
  const last = trend.sessions.length - 1;
  const rows = [...active.rows].sort((a, b) => b.counts[last] - a.counts[last] || a.name.localeCompare(b.name));
  const several = trend.groupings.length > 1;

  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-5">
        <div>
          <h3 className="font-display text-lg font-semibold">{several ? "Groups at recent services" : "Departments at recent services"}</h3>
          <p className="text-sm text-ink-muted">How many from each checked in. Open a service for names.</p>
        </div>
        {several && (
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Show by">
            {trend.groupings.map((g) => (
              <button
                key={g.key}
                type="button"
                role="tab"
                aria-selected={g.key === active.key}
                onClick={() => setKey(g.key)}
                className={cn("h-8 rounded-lg px-3 text-sm font-medium", g.key === active.key ? "bg-primary/10 text-primary" : "text-ink-muted hover:bg-surface-2")}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-faint">
              <th className="sticky left-0 bg-surface px-5 py-2.5 font-medium">{active.key === "departments" ? "Department" : active.label}</th>
              {trend.sessions.map((s) => (
                <th key={s.id} className="px-3 py-2.5 text-right font-medium">
                  <Link href={`/app/attendance/${s.id}`} className="hover:text-primary" title={s.serviceName}>
                    {new Date(s.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    <span className="block max-w-[7rem] truncate text-[10px] font-normal">{s.serviceName}</span>
                  </Link>
                </th>
              ))}
              <th className="px-5 py-2.5 text-right font-medium">Members</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line-soft last:border-0">
                <td className="sticky left-0 bg-surface px-5 py-2.5 font-medium">{r.name}</td>
                {r.counts.map((c, i) => (
                  <td key={trend.sessions[i].id} className={`px-3 py-2.5 text-right tabular-nums ${i === last ? "font-semibold text-ink" : "text-ink-muted"}`}>
                    {c}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right tabular-nums text-ink-faint">{r.members}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
