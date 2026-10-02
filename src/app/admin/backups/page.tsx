import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { BackupsAdmin } from "@/components/admin/backups-admin";
import { db } from "@/lib/db";
import { backupsConfigured } from "@/lib/backups/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function AdminBackupsPage() {
  const sa = await requireSuperAdmin();

  const [platform, churches, totals, recent] = await Promise.all([
    db.platformConfig.findUnique({ where: { id: "default" }, select: { backupsEnabled: true, backupKeep: true } }),
    db.church.findMany({
      where: { isDemo: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, autoBackup: true, lastBackupAt: true, lastBackupAttemptAt: true },
    }),
    db.churchBackup.groupBy({ by: ["churchId"], where: { status: "ok" }, _count: { _all: true }, _sum: { sizeBytes: true } }),
    db.churchBackup.findMany({
      where: { status: "ok" },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, churchId: true, trigger: true, sizeBytes: true, rowCount: true, createdAt: true },
    }),
  ]);

  const stat = new Map(totals.map((t) => [t.churchId, { count: t._count._all, bytes: t._sum.sizeBytes ?? 0 }]));
  const names = new Map(churches.map((c) => [c.id, c.name]));

  return (
    <AdminShell email={sa.email}>
      <BackupsAdmin
        configured={backupsConfigured()}
        enabled={platform?.backupsEnabled ?? true}
        keep={platform?.backupKeep ?? 7}
        churches={churches.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          autoBackup: c.autoBackup,
          lastBackupAt: c.lastBackupAt?.toISOString() ?? null,
          lastAttemptAt: c.lastBackupAttemptAt?.toISOString() ?? null,
          count: stat.get(c.id)?.count ?? 0,
          bytes: stat.get(c.id)?.bytes ?? 0,
        }))}
        recent={recent.map((r) => ({
          id: r.id,
          church: names.get(r.churchId) ?? "Unknown",
          trigger: r.trigger,
          sizeBytes: r.sizeBytes,
          rowCount: r.rowCount,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </AdminShell>
  );
}
