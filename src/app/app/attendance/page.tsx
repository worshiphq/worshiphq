import { QrCode, UserCheck, TrendingUp, CalendarCheck2, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { AttendanceBarChart } from "@/components/app/charts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth";
import { getAttendance } from "@/lib/data/modules";
import { recordService } from "@/app/actions/attendance";
import { ActionDialog, Field } from "@/components/app/action-dialog";

export const metadata = { title: "Attendance" };

export default async function AttendancePage() {
  const session = await requireSession();
  const { weekly, total, trend, byBranch } = await getAttendance(session.churchId);

  return (
    <div>
      <PageHeader title="Attendance" description="Record and track who's gathering, service by service.">
        <Button variant="secondary" size="sm"><QrCode /> QR check-in</Button>
        <ActionDialog
          triggerLabel="Record service"
          triggerIcon={<Plus />}
          title="Record service attendance"
          description="Log a headcount for a service or meeting."
          submitLabel="Save attendance"
          action={recordService}
          disabled={session.isDemo}
        >
          <Field label="Service" name="serviceName" placeholder="Sunday 1st Service" defaultValue="Sunday Service" required />
          <Field label="Date" name="date" type="date" required />
          <Field label="Headcount" name="count" type="number" placeholder="e.g. 240" required />
        </ActionDialog>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="This week" value={weekly} icon={UserCheck} />
        <StatCard label="Records (6 mo)" value={total} icon={CalendarCheck2} />
        <StatCard label="Branches" value={byBranch.length} icon={TrendingUp} />
        <StatCard label="Check-in ready" value={byBranch.length} suffix=" sites" icon={QrCode} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="border-b border-line p-5"><h3 className="font-display text-lg font-semibold">Attendance trend</h3><p className="text-sm text-ink-muted">Records logged by month</p></div>
          <div className="p-3"><AttendanceBarChart data={trend} /></div>
        </Card>

        <Card>
          <div className="border-b border-line p-5"><h3 className="font-display text-lg font-semibold">By branch (this week)</h3></div>
          <div className="divide-y divide-line-soft">
            {byBranch.length === 0 && <div className="p-6 text-sm text-ink-faint">No branches yet.</div>}
            {byBranch.map((b) => (
              <div key={b.name} className="flex items-center justify-between px-5 py-3.5">
                <span className="flex items-center gap-2 text-sm font-medium">{b.name}{b.isHQ && <Badge variant="primary" className="px-1.5 py-0 text-[9px]">HQ</Badge>}</span>
                <span className="text-sm text-ink-muted">{b.present} present</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {total === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-line p-8 text-center">
          <h3 className="font-display text-lg font-semibold">Start tracking attendance</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">Record a service manually or use QR check-in to see trends, first-time visitors and per-branch breakdowns here.</p>
        </div>
      )}
    </div>
  );
}
