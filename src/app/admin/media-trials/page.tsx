import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "WorshipHQ Live trials" };

async function allowAgain(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  const id = String(formData.get("machineId") ?? "");
  if (id) await db.mediaTrialMachine.deleteMany({ where: { machineId: id } });
  revalidatePath("/admin/media-trials");
}

/**
 * SuperAdmin › Media trials: every computer that has had its WorshipHQ Live free trial (one per computer, kept
 * after Windows is reinstalled). "Allow another trial" is for genuine cases, like a second-hand computer.
 */
export default async function MediaTrialsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sa = await requireSuperAdmin();
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const churches = q
    ? await db.church.findMany({ where: { name: { contains: q, mode: "insensitive" } }, select: { id: true }, take: 200 })
    : null;
  const rows = await db.mediaTrialMachine.findMany({
    where: churches ? { churchId: { in: churches.map((c) => c.id) } } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const ids = [...new Set(rows.map((r) => r.churchId).filter((x): x is string => !!x))];
  const [names, devices] = await Promise.all([
    db.church.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    db.mediaDevice.findMany({ where: { deviceId: { in: rows.map((r) => r.machineId) } }, select: { deviceId: true, name: true } }),
  ]);
  const churchName = new Map(names.map((c) => [c.id, c.name]));
  const pcName = new Map(devices.map((d) => [d.deviceId, d.name]));

  return (
    <AdminShell email={sa.email} isOwner={sa.role === "owner"}>
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold">WorshipHQ Live free trials</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Each computer gets one 14-day free trial of WorshipHQ Live, whatever email signs up on it, even after Windows is
          reinstalled. Allow another trial only for genuine cases (for example a computer bought second-hand).
        </p>
        <form className="mt-4 flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search by church" className="h-10 flex-1 rounded-lg border border-line bg-surface px-3 text-sm" />
          <button className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white">Search</button>
        </form>
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-ink-muted">
              <tr><th className="px-3 py-2">Church</th><th className="px-3 py-2">Computer</th><th className="px-3 py-2">Trial started</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-ink-muted">No trials yet.</td></tr>}
              {rows.map((r) => (
                <tr key={r.machineId} className="border-t border-line">
                  <td className="px-3 py-2">{(r.churchId && churchName.get(r.churchId)) || <span className="text-ink-muted">Deleted church</span>}</td>
                  <td className="px-3 py-2">{pcName.get(r.machineId) ?? <span className="font-mono text-xs text-ink-muted">{r.machineId.slice(0, 12)}…</span>}</td>
                  <td className="px-3 py-2">{r.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-3 py-2 text-right">
                    <form action={allowAgain}>
                      <input type="hidden" name="machineId" value={r.machineId} />
                      <button className="rounded-lg border border-line px-3 py-1 text-xs font-semibold hover:bg-surface">Allow another trial</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
