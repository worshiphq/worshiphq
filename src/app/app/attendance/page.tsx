import Link from "next/link";
import { QrCode, UserCheck, TrendingUp, CalendarCheck2, Plus, ChevronRight, Users } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { AttendanceBarChart } from "@/components/app/charts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireSession } from "@/lib/auth";
import { getAttendanceOverview } from "@/lib/data/attendance";
import { recordService, startCheckIn } from "@/app/actions/attendance";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { PageTips } from "@/components/app/page-tips";

export const metadata = { title: "Attendance" };

export default async function AttendancePage() {
  const session = await requireSession();
  const { kpis, trend, mostRecent, history } = await getAttendanceOverview(session.churchId);
  const past = history.slice(mostRecent ? 1 : 0);

  return (
    <div>
      <PageTips
        tourId="attendance"
        steps={[
          { target: "att-checkin", title: "Live check-in & QR", body: "Start a check-in session — tap members present or let them scan a QR code to check themselves in." },
          { target: "att-record", title: "Quick headcount", body: "In a hurry? Record a service with just the number of adults, teens, children and visitors." },
          { target: "att-recent", title: "Most recent service", body: "Your latest service appears here. Click it to open its own dashboard — who attended and the breakdown." },
          { target: "att-history", title: "Full history", body: "Every past service is saved here. Click any to see who was present and the demographics." },
        ]}
      />

      <PageHeader title="Attendance" description="Record and track who's gathering, service by service.">
        <form action={startCheckIn} data-tour="att-checkin">
          <input type="hidden" name="serviceName" value="" />
          <SubmitButton variant="secondary" size="sm" pendingLabel="Starting…" overlay>
            <QrCode /> Start check-in
          </SubmitButton>
        </form>
        <span data-tour="att-record">
          <ActionDialog
            triggerLabel="Record service"
            triggerIcon={<Plus />}
            title="Record service attendance"
            description="Log a headcount with a simple demographic breakdown."
            submitLabel="Save attendance"
            pendingLabel="Saving…"
            successMessage="Attendance recorded"
            action={recordService}
            disabled={session.isDemo}
          >
            <Field label="Service" name="serviceName" placeholder="Sunday 1st Service" defaultValue="Sunday Service" required />
            <Field label="Date" name="date" type="date" required />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Adults" name="adults" type="number" placeholder="0" defaultValue={0} />
              <Field label="Teens" name="teens" type="number" placeholder="0" defaultValue={0} />
              <Field label="Children" name="children" type="number" placeholder="0" defaultValue={0} />
              <Field label="Visitors" name="visitors" type="number" placeholder="0" defaultValue={0} />
            </div>
          </ActionDialog>
        </span>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="This week" value={kpis.thisWeek} icon={UserCheck} />
        <StatCard label="This month" value={kpis.thisMonth} icon={CalendarCheck2} />
        <StatCard label="Avg / service" value={kpis.avg} icon={TrendingUp} />
        <StatCard label="Services logged" value={kpis.sessions} icon={Users} />
      </div>

      {/* Most recent service */}
      {mostRecent && (
        <Link href={`/app/attendance/${mostRecent.id}`} data-tour="att-recent" className="mt-4 block">
          <Card className="group flex flex-wrap items-center justify-between gap-4 p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
            <div className="flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary-bright">
                <CalendarCheck2 className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg font-semibold">{mostRecent.serviceName}</h3>
                  <Badge variant="primary" className="px-2 py-0 text-[10px]">Most recent</Badge>
                </div>
                <p className="text-sm text-ink-muted">
                  {new Date(mostRecent.date).toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "long" })}
                  {mostRecent.branch ? ` · ${mostRecent.branch}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="font-display text-2xl font-bold">{mostRecent.total}</div>
                <div className="text-xs text-ink-faint">present</div>
              </div>
              <ChevronRight className="size-5 text-ink-faint transition-transform group-hover:translate-x-1" />
            </div>
          </Card>
        </Link>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="border-b border-line p-5"><h3 className="font-display text-lg font-semibold">Attendance trend</h3><p className="text-sm text-ink-muted">Total present by month</p></div>
          <div className="p-3"><AttendanceBarChart data={trend} /></div>
        </Card>

        <Card data-tour="att-history">
          <div className="border-b border-line p-5"><h3 className="font-display text-lg font-semibold">Service history</h3></div>
          <div className="max-h-80 divide-y divide-line-soft overflow-y-auto">
            {past.length === 0 && <div className="p-6 text-sm text-ink-faint">No earlier services yet.</div>}
            {past.map((s) => (
              <Link key={s.id} href={`/app/attendance/${s.id}`} className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-surface-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{s.serviceName}</div>
                  <div className="text-xs text-ink-faint">{new Date(s.date).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}</div>
                </div>
                <span className="flex items-center gap-2 text-sm text-ink-muted">{s.total} <ChevronRight className="size-4 text-ink-faint" /></span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {history.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-line p-8 text-center">
          <h3 className="font-display text-lg font-semibold">Start tracking attendance</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">Use <strong>Start check-in</strong> for live QR/tap check-in, or <strong>Record service</strong> for a quick headcount. Each service gets its own dashboard.</p>
        </div>
      )}
    </div>
  );
}
