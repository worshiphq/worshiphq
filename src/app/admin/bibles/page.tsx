import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { BiblesAdmin } from "@/components/admin/bibles-admin";
import { db } from "@/lib/db";
import { LIVE_CHURCH } from "@/lib/live-church";
import { r2Ready } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** SuperAdmin › Bibles: Bibles published for churches to download inside WorshipHQ Live. */
export default async function AdminBiblesPage() {
  const sa = await requireSuperAdmin();
  const [bibles, churches] = await Promise.all([
    db.mediaBible.findMany({ orderBy: [{ language: "asc" }, { name: "asc" }] }),
    db.church.findMany({ where: LIVE_CHURCH, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <AdminShell email={sa.email} isOwner={sa.role === "owner"}>
      <BiblesAdmin
        storageReady={r2Ready}
        churches={churches}
        bibles={bibles.map((b) => ({
          id: b.id,
          abbreviation: b.abbreviation,
          name: b.name,
          language: b.language,
          format: b.format,
          sizeBytes: b.sizeBytes,
          licence: b.licence,
          audience: b.audience as "all" | "churches",
          churchIds: b.churchIds,
          active: b.active,
          downloads: b.downloads,
          createdAt: b.createdAt.toISOString(),
        }))}
      />
    </AdminShell>
  );
}
