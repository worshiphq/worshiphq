import { requireSuperAdmin } from "@/lib/auth";
import { getReceiptsPage } from "@/app/actions/admin-receipts";
import { AdminShell } from "@/components/admin/admin-shell";
import { ReceiptsClient } from "@/components/admin/receipts-client";

export const metadata = { title: "Receipts" };

export default async function AdminReceiptsPage() {
  const sa = await requireSuperAdmin();
  const data = await getReceiptsPage();
  return (
    <AdminShell email={sa.email}>
      <ReceiptsClient data={data} />
    </AdminShell>
  );
}
