import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { queryStaff, staffCounts } from "@/lib/data/staff";
import { PageHeader } from "@/components/app/page-header";
import { StaffClient } from "@/components/app/payroll/staff-client";
import { cn } from "@/lib/utils";

export const metadata = { title: "Staff" };

const TABS = [
  { key: "staff", label: "Staff" },
] as const;

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireModule("staff");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "staff";
  const editable = canEdit(session, "staff");

  const [first, counts, departments, team] = await Promise.all([
    queryStaff(session.churchId, "", {}, 1),
    staffCounts(session.churchId),
    db.department.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { churchId: session.churchId, staffPortalOnly: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader title="Staff" description="Your church's employees: their details, leave and time. Pay is only visible to people with payroll access." />
      {TABS.length > 1 && (
        <nav aria-label="Staff sections" className="mb-6 inline-flex gap-0.5 rounded-xl border border-line bg-surface-2 p-1 text-sm">
          {TABS.map((t) => (
            <Link key={t.key} href={`/app/staff?tab=${t.key}`} prefetch={false} aria-current={tab === t.key ? "page" : undefined}
              className={cn("rounded-lg px-3.5 py-1.5 font-medium", tab === t.key ? "bg-primary text-white shadow-sm" : "text-ink-muted hover:text-ink")}>{t.label}</Link>
          ))}
        </nav>
      )}
      {tab === "staff" && <StaffClient initial={first} counts={counts} departments={departments} team={team} canEdit={editable} />}
    </div>
  );
}
