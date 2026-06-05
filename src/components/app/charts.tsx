"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compactNumber } from "@/lib/utils";

const tooltipStyle = {
  background: "#1c1c28",
  border: "1px solid #262630",
  borderRadius: 12,
  fontSize: 12,
  color: "#ececf1",
} as const;

export function TrendAreaChart({ data }: { data: { month: string; amount: number; attendance: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9B6DFF" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#6D5EF8" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis dataKey="month" stroke="#65656f" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke="#65656f" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₵${compactNumber(v)}`} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`₵${Number(v).toLocaleString()}`, "Giving"]} cursor={{ stroke: "#262630" }} />
        <Area type="monotone" dataKey="amount" stroke="#9B6DFF" strokeWidth={2.5} fill="url(#g1)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function AttendanceBarChart({ data }: { data: { month: string; attendance: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
        <XAxis dataKey="month" stroke="#65656f" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke="#65656f" fontSize={12} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(109,94,248,0.08)" }} formatter={(v) => [Number(v).toLocaleString(), "Attendance"]} />
        <Bar dataKey="attendance" radius={[6, 6, 0, 0]} fill="#6D5EF8" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FundDonut({ data }: { data: { name: string; value: number }[] }) {
  const colors = ["#6D5EF8", "#9B6DFF", "#E5B567", "#34D399", "#60A5FA"];
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={150} height={150}>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => `₵${Number(v).toLocaleString()}`} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-2">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-ink-muted">
              <span className="size-2.5 rounded-full" style={{ background: colors[i % colors.length] }} />
              {d.name}
            </span>
            <span className="font-medium">{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
