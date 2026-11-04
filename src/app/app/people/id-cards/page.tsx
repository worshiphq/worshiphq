import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app/page-header";
import { IdCardPicker } from "@/components/app/id-card-picker";

export const metadata = { title: "Member ID cards" };

export default async function IdCardsPage() {
  const session = await requireModule("people");
  // A paid feature in its own right (Starter and up). Checked here, not only on the button, so a saved or
  // shared link is refused too.
  if (!session.isDemo && session.planLocked?.includes("member-ids")) redirect("/app/settings?tab=billing");

  const [people, departments] = await Promise.all([
    db.person.findMany({
      where: { churchId: session.churchId, status: { not: "visitor" } },
      select: { id: true, firstName: true, lastName: true, memberId: true, departments: { select: { name: true } } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 2000,
    }),
    db.department.findMany({ where: { churchId: session.churchId }, select: { name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <Link href="/app/people" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Back to people
      </Link>
      <PageHeader
        title="Member ID cards"
        description="Print a card for each member: photo, name, member ID, your logo and a QR code your check-in scanner can read."
      />
      <IdCardPicker
        canWrite={canEdit(session, "people")}
        departments={departments.map((d) => d.name)}
        people={people.map((p) => ({
          id: p.id,
          name: `${p.firstName} ${p.lastName}`.trim(),
          memberId: p.memberId,
          departments: p.departments.map((d) => d.name),
        }))}
      />
    </div>
  );
}
