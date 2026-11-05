import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { DepartmentDetailClient } from "@/components/app/department-detail-client";
import { queryDepartmentMembers, departmentMemberIds } from "@/lib/data/lists-b";

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
    },
  });
  if (!dept) notFound();

  const [first, memberIdList] = await Promise.all([
    queryDepartmentMembers(session.churchId, dept.id, "", 1),
    departmentMemberIds(session.churchId, dept.id),
  ]);

  const allPeople = await db.person.findMany({
    where: { churchId: session.churchId, status: { not: "visitor" } },
    select: { id: true, firstName: true, lastName: true, phone: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 3000,
  });

  const memberIds = new Set(memberIdList);
  return (
    <DepartmentDetailClient
      department={{ id: dept.id, name: dept.name, description: dept.description }}
      initial={first}
      people={allPeople
        .filter((p) => !memberIds.has(p.id))
        .map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), phone: p.phone }))}
      canWrite={canEdit(session, "people")}
    />
  );
}
