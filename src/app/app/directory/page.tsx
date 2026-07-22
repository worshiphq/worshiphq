import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { DirectoryClient } from "@/components/app/directory-client";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Member directory" };

export default async function DirectoryPage() {
  const session = await requireModule("directory");

  const [people, departments] = await Promise.all([
    db.person.findMany({
      where: { churchId: session.churchId, status: "active" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        photoUrl: true,
        title: true,
        occupation: true,
        memberId: true,
        departments: { select: { id: true, name: true } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    db.department.findMany({
      where: { churchId: session.churchId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Member directory"
        description={`${people.length} active member${people.length !== 1 ? "s" : ""}`}
      />
      <DirectoryClient
        members={people.map((p) => ({
          id: p.id,
          name: `${p.title ? p.title + " " : ""}${p.firstName} ${p.lastName}`,
          phone: p.phone,
          email: p.email,
          photoUrl: p.photoUrl,
          memberId: p.memberId,
          occupation: p.occupation,
          departments: p.departments.map((d) => d.name),
        }))}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
      />
    </div>
  );
}
