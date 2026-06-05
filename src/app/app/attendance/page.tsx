import { QrCode, UserCheck, TrendingUp, CalendarCheck2, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { AttendanceBarChart } from "@/components/app/charts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { givingTrend, branches } from "@/lib/demo/data";

const services = [
  { name: "1st Service", time: "07:00", present: 612, capacity: 800 },
  { name: "2nd Service", time: "09:30", present: 743, capacity: 800 },
  { name: "Evening Service", time: "17:00", present: 388, capacity: 600 },
];

const groups = [
  { name: "Youth Ministry", present: 142, total: 180 },
  { name: "Children's Church", present: 96, total: 120 },
  { name: "Worship Team", present: 38, total: 42 },
  { name: "Ushering", present: 24, total: 28 },
];

export default function AttendancePage() {
  return (
    <div>
      <PageHeader title="Attendance" description="Record and track who's gathering, service by service.">
        <Button variant="secondary" size="sm"><QrCode /> QR check-in</Button>
        <Button size="sm"><Plus /> Record service</Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Last Sunday" value={1485} change={5.3} icon={UserCheck} />
        <StatCard label="6-week average" value={1372} change={3.1} icon={CalendarCheck2} />
        <StatCard label="First-time visitors" value={34} change={18.2} icon={TrendingUp} />
        <StatCard label="Check-in rate" value={94} suffix="%" change={1.4} icon={QrCode} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">Attendance trend</h3>
            <p className="text-sm text-ink-muted">Weekly average by month</p>
          </div>
          <div className="p-3">
            <AttendanceBarChart data={givingTrend} />
          </div>
        </Card>

        <Card>
          <div className="border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">Last Sunday by service</h3>
          </div>
          <div className="space-y-4 p-5">
            {services.map((s) => (
              <div key={s.name}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium">{s.name} <span className="text-ink-faint">· {s.time}</span></span>
                  <span className="text-ink-muted">{s.present}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-bright" style={{ width: `${(s.present / s.capacity) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">By group</h3>
          </div>
          <div className="divide-y divide-line-soft">
            {groups.map((g) => (
              <div key={g.name} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm font-medium">{g.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-ink-muted">{g.present}/{g.total}</span>
                  <Badge variant={g.present / g.total > 0.8 ? "success" : "warning"}>
                    {Math.round((g.present / g.total) * 100)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">By branch</h3>
          </div>
          <div className="divide-y divide-line-soft">
            {branches.map((b) => (
              <div key={b.id} className="flex items-center justify-between px-5 py-3.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {b.name}
                  {b.isHQ && <Badge variant="primary" className="px-1.5 py-0 text-[9px]">HQ</Badge>}
                </span>
                <span className="text-sm text-ink-muted">{Math.round(b.members * 0.48).toLocaleString()} present</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
