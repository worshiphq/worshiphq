import Link from "next/link";
import { Card } from "@/components/ui/card";

type Trend = {
  sessions: { id: string; serviceName: string; date: string }[];
  rows: { id: string; name: string; members: number; counts: number[] }[];
};

/** Department turnout across recent checked-in services (latest on the right). */
export function DepartmentTrend({ trend }: { trend: Trend }) {
  if (trend.sessions.length === 0 || trend.rows.length === 0) return null;
  const last = trend.sessions.length - 1;
  const rows = [...trend.rows].sort((a, b) => b.counts[last] - a.counts[last] || a.name.localeCompare(b.name));

  return (
    <Card className="mt-4">
      <div className="border-b border-line p-5">
        <h3 className="font-display text-lg font-semibold">Departments at recent services</h3>
        <p className="text-sm text-ink-muted">How many from each department checked in. Open a service for names.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-faint">
              <th className="sticky left-0 bg-surface px-5 py-2.5 font-medium">Department</th>
              {trend.sessions.map((s) => (
                <th key={s.id} className="px-3 py-2.5 text-right font-medium">
                  <Link href={`/app/attendance/${s.id}`} className="hover:text-primary" title={s.serviceName}>
                    {new Date(s.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
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
