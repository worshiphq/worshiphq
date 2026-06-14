import { requireSuperAdmin } from "@/lib/auth";
import { getAllAnnouncements } from "@/lib/data/announcements";
import { AdminShell } from "@/components/admin/admin-shell";
import { BroadcastComposer } from "@/components/admin/broadcast-composer";

export default async function AdminBroadcastPage() {
  const sa = await requireSuperAdmin();
  const announcements = await getAllAnnouncements();

  return (
    <AdminShell email={sa.email}>
      <div className="mb-6">
        <h1 className="text-lg font-bold tracking-tight">Broadcast</h1>
        <p className="text-sm text-slate-400">
          Publish an announcement banner shown to every church in their dashboard.
        </p>
      </div>
      <BroadcastComposer announcements={announcements} />
    </AdminShell>
  );
}
