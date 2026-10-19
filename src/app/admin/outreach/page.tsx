import { requireSuperAdmin } from "@/lib/auth";
import { getOutreachData } from "@/app/actions/admin-outreach";
import { AdminShell } from "@/components/admin/admin-shell";
import { OutreachClient } from "@/components/admin/outreach-client";

export const metadata = { title: "Outreach" };

export default async function AdminOutreachPage() {
  const sa = await requireSuperAdmin();
  const data = await getOutreachData();
  return (
    <AdminShell email={sa.email}>
      <OutreachClient data={data} />
    </AdminShell>
  );
}
