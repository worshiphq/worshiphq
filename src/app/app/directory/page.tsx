import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { DirectoryClient } from "@/components/app/directory-client";
import { PageHeader } from "@/components/app/page-header";
import { queryDirectory } from "@/lib/data/directory";

export const metadata = { title: "Member directory" };

export default async function DirectoryPage() {
  const session = await requireModule("directory");

  const [first, departments, groups, activeCount] = await Promise.all([
    queryDirectory(session.churchId, "", "", "", 1),
    db.department.findMany({
      where: { churchId: session.churchId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.group.findMany({ where: { churchId: session.churchId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.person.count({ where: { churchId: session.churchId, status: "active" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Member directory"
        description={`${activeCount} active member${activeCount !== 1 ? "s" : ""}`}
      />
      <DirectoryClient
        initial={first}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        groups={groups}
      />
    </div>
  );
}
