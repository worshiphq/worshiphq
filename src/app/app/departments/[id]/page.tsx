import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { DepartmentDetailClient } from "@/components/app/department-detail-client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dept = await db.department.findUnique({ where: { id }, select: { name: true } });
  return { title: dept?.name ?? "Department" };
}

export default async function DepartmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireModule("people");

  const dept = await db.department.findFirst({
    where: { id, churchId: session.churchId },
    select: {
      id: true,
      name: true,
      description: true,
      members: {
        select: { id: true, firstName: true, lastName: true, phone: true, photoUrl: true, gender: true, status: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      },
    },
  });
  if (!dept) notFound();

  // People linked only by the legacy single-department field were never in `members`, so they would
  // look missing on this page even though every report counts them. Fold them in.
  const legacy = await db.person.findMany({
    where: { churchId: session.churchId, departmentId: dept.id, NOT: { departments: { some: { id: dept.id } } } },
    select: { id: true, firstName: true, lastName: true, phone: true, photoUrl: true, gender: true, status: true },
  });
  const merged = [...dept.members, ...legacy].sort(
    (a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName),
  );

  const allPeople = await db.person.findMany({
    where: { churchId: session.churchId, status: { not: "visitor" } },
    select: { id: true, firstName: true, lastName: true, phone: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 3000,
  });

  const memberIds = new Set(merged.map((m) => m.id));
  return (
    <DepartmentDetailClient
      department={{ id: dept.id, name: dept.name, description: dept.description }}
      members={merged.map((m) => ({
        id: m.id,
        name: `${m.firstName} ${m.lastName}`.trim(),
        phone: m.phone,
        photoUrl: m.photoUrl,
        gender: m.gender,
        inactive: m.status === "inactive",
      }))}
      people={allPeople
        .filter((p) => !memberIds.has(p.id))
        .map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), phone: p.phone }))}
      canWrite={canEdit(session, "people")}
    />
  );
}
