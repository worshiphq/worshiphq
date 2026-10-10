import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { db } from "@/lib/db";

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";

export default async function AdminAccessPage() {
  const sa = await requireSuperAdmin();
  const rows = await db.supportAccess.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { church: { select: { name: true } } },
  });
  const now = new Date();

  // A row can still say "active"/"pending" after its time ran out.
  const label = (r: (typeof rows)[number]) => {
    if (r.status === "active" && r.until && r.until < now) return "expired";
    if (r.status === "pending" && r.codeExpires && r.codeExpires < now) return "expired";
    return r.status;
  };
  const tone: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-300",
    pending: "bg-amber-500/15 text-amber-300",
    ended: "bg-white/10 text-slate-300",
    expired: "bg-white/10 text-slate-400",
    cancelled: "bg-white/10 text-slate-400",
  };

  return (
    <AdminShell email={sa.email}>
      <div className="mb-6">
        <h1 className="text-lg font-bold tracking-tight">Access log</h1>
        <p className="text-sm text-slate-400">
          Every time you asked to enter a church account. Code entries are consent-based; emergency entries need a recorded reason.
        </p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02] text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Church</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Requested</th>
              <th className="px-4 py-3 font-medium">Started</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = label(r);
              return (
                <tr key={r.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-slate-200">{r.church.name}</td>
                  <td className="px-4 py-3 text-slate-300">{r.method === "consent" ? "Code" : "Emergency"}</td>
                  <td className="px-4 py-3 text-slate-400">{r.reason ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-400">{fmt(r.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-400">{fmt(r.startedAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${tone[st] ?? tone.ended}`}>{st}</span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">No access requests yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
