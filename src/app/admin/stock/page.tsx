import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { StockAdmin } from "@/components/admin/stock-admin";
import { r2Ready, signedGetUrl } from "@/lib/storage";
import { STOCK_PREFIX, readStock } from "@/lib/media-stock";

export const dynamic = "force-dynamic";

/** SuperAdmin › Backgrounds: the free pictures and motion loops churches download in WorshipHQ Live. */
export default async function AdminStockPage() {
  const sa = await requireSuperAdmin();
  const m = r2Ready ? await readStock(true) : { version: 1, items: [] };
  const items = await Promise.all(m.items.map(async (i) => ({ ...i, thumbUrl: await signedGetUrl(STOCK_PREFIX + i.thumb, 3600) })));
  return (
    <AdminShell email={sa.email} isOwner={sa.role === "owner"}>
      <StockAdmin storageReady={r2Ready} items={items} />
    </AdminShell>
  );
}
