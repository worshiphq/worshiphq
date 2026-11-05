import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { DepartmentDetailClient } from "@/components/app/department-detail-client";
import { queryDepartmentMembers } from "@/lib/data/lists-b";

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

  const first = await queryDepartmentMembers(session.churchId, dept.id, "", 1);

  return (
    <DepartmentDetailClient
      department={{ id: dept.id, name: dept.name, description: dept.description }}
      initial={first}
      canWrite={canEdit(session, "people")}
    />
  );
}
