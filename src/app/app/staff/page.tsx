import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { queryStaff, staffCounts } from "@/lib/data/staff";
import { leaveOverview, attendanceWeek } from "@/lib/data/leave";
import { PageHeader } from "@/components/app/page-header";
import { StaffClient } from "@/components/app/payroll/staff-client";
import { LeaveClient } from "@/components/app/payroll/leave-client";
import { AttendanceClient } from "@/components/app/payroll/attendance-client";
import { TabLink } from "@/components/app/payroll/ui";

export const metadata = { title: "Staff" };

const TABS = [
  { key: "staff", label: "Staff" },
  { key: "leave", label: "Leave" },
  { key: "attendance", label: "Attendance" },
] as const;

function mondayOf(iso?: string) {
  const d = iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00.000Z`) : new Date();
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86_400_000);
}

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ tab?: string; y?: string; m?: string; week?: string }> }) {
  const session = await requireModule("staff");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "staff";
  const editable = canEdit(session, "staff");
  const now = new Date();

  let body: React.ReactNode = null;
  if (tab === "staff") {
    const [first, counts, departments, team] = await Promise.all([
      queryStaff(session.churchId, "", {}, 1),
      staffCounts(session.churchId),
      db.department.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      db.user.findMany({ where: { churchId: session.churchId, staffPortalOnly: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    body = <StaffClient initial={first} counts={counts} departments={departments} team={team} canEdit={editable} />;
  } else if (tab === "leave") {
    const y = Number(sp.y) >= 2000 && Number(sp.y) <= 2100 ? Number(sp.y) : now.getUTCFullYear();
    const m = Number(sp.m) >= 1 && Number(sp.m) <= 12 ? Number(sp.m) : now.getUTCMonth() + 1;
    const data = await leaveOverview(session.churchId, y, m);
    body = <LeaveClient data={data} year={y} month={m} canManage={editable} userId={session.userId} />;
  } else {
    const monday = mondayOf(sp.week);
    const w = await attendanceWeek(session.churchId, monday);
    body = <AttendanceClient monday={monday.toISOString().slice(0, 10)} staff={w.staff} rows={w.rows} canManage={editable} />;
  }

  return (
    <div>
      <PageHeader title="Staff" description="Your church's employees: their details, leave and time. Pay is only visible to people with payroll access." />
      <nav aria-label="Staff sections" className="mb-6 inline-flex gap-0.5 rounded-xl border border-line bg-surface-2 p-1 text-sm">
        {TABS.map((t) => (
          <TabLink key={t.key} href={`/app/staff?tab=${t.key}`} label={t.label} active={tab === t.key} />
        ))}
      </nav>
      {body}
    </div>
  );
}
