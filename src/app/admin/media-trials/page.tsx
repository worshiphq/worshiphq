import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/admin-audit";
import { LIVE_CHURCH } from "@/lib/live-church";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "WorshipHQ Live" };

const input = "h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white focus-visible:border-teal-400/60 focus-visible:outline-none";
const dateText = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Give a church WorshipHQ Live free for some months (on top of any time it already has). */
async function giftLive(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  const churchId = String(formData.get("churchId") ?? "");
  const months = Math.min(36, Math.max(1, Number(formData.get("months")) || 12));
  if (!churchId) return;
  const sub = await db.subscription.findUnique({ where: { churchId }, select: { mediaUntil: true, mediaIsTrial: true } });
  const now = new Date();
  // Paid or gifted time still running carries on; a free trial is replaced by the gift.
  const from = sub?.mediaUntil && sub.mediaUntil > now && !sub.mediaIsTrial ? sub.mediaUntil : now;
  const until = new Date(from);
  until.setMonth(until.getMonth() + months);
  await logAdminAction("giftLive", { churchId, months, until: until.toISOString() });
  await db.subscription.upsert({
    where: { churchId },
    create: { churchId, mediaUntil: until, mediaIsTrial: false, mediaTrialUsed: true, mediaInterval: "granted" },
    update: { mediaUntil: until, mediaIsTrial: false, mediaTrialUsed: true, mediaInterval: "granted" },
  });
  revalidatePath("/admin/media-trials");
}

/** End a gift now. */
async function stopGift(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  const churchId = String(formData.get("churchId") ?? "");
  if (!churchId) return;
  await logAdminAction("stopLiveGift", { churchId });
  await db.subscription.updateMany({ where: { churchId, mediaInterval: "granted" }, data: { mediaUntil: new Date() } });
  revalidatePath("/admin/media-trials");
}

async function allowAgain(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  const id = String(formData.get("machineId") ?? "");
  if (!id) return;
  await logAdminAction("allowLiveTrialAgain", { machineId: id });
  await db.mediaTrialMachine.deleteMany({ where: { machineId: id } });
  revalidatePath("/admin/media-trials");
}

/**
 * SuperAdmin › WorshipHQ Live: which churches have it (paid, trial or gift), gifting it, and the computers that have
 * had their one free trial ("Allow another trial" for genuine cases, like a second-hand computer).
 */
export default async function LiveAdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sa = await requireSuperAdmin();
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const now = new Date();

  const [allChurches, withLive, rows] = await Promise.all([
    db.church.findMany({ where: LIVE_CHURCH, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.subscription.findMany({
      where: { mediaUntil: { gt: now } },
      select: { churchId: true, mediaUntil: true, mediaIsTrial: true, mediaInterval: true, church: { select: { name: true } } },
      orderBy: { mediaUntil: "desc" },
    }),
    db.mediaTrialMachine.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const churchName = new Map(allChurches.map((c) => [c.id, c.name]));
  const devices = await db.mediaDevice.findMany({ where: { deviceId: { in: rows.map((r) => r.machineId) } }, select: { deviceId: true, name: true } });
  const pcName = new Map(devices.map((d) => [d.deviceId, d.name]));
  const shownTrials = q ? rows.filter((r) => (r.churchId && churchName.get(r.churchId)?.toLowerCase().includes(q.toLowerCase()))) : rows;

  return (
    <AdminShell email={sa.email} isOwner={sa.role === "owner"}>
      <div className="mx-auto max-w-4xl text-white">
        <h1 className="text-2xl font-bold">WorshipHQ Live</h1>
        <p className="mt-1 text-sm text-white/50">Who has WorshipHQ Live, gifts, and free trials. The launch switch and promotions are in Pricing › Promotions.</p>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-semibold">Gift WorshipHQ Live</h2>
          <p className="mt-1 text-sm text-white/50">
            Free WorshipHQ Live for a church, for the months you choose (added after any paid time it already has). A gifted
            church can use it even before launch, on 2 computers.
          </p>
          <form action={giftLive} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="grid flex-1 gap-1 text-xs text-white/60">Church
              <select name="churchId" required className={`${input} min-w-64`} defaultValue="">
                <option value="" disabled>Choose a church…</option>
                {allChurches.map((c) => <option key={c.id} value={c.id} className="text-black">{c.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-white/60">For
              <select name="months" defaultValue="12" className={input}>
                {[1, 3, 6, 12, 24].map((m) => <option key={m} value={m} className="text-black">{m} month{m === 1 ? "" : "s"}</option>)}
              </select>
            </label>
            <button className="h-10 rounded-lg bg-teal-500 px-4 text-sm font-semibold text-white hover:bg-teal-400">Give WorshipHQ Live</button>
          </form>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-semibold">Churches with WorshipHQ Live now</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-white/50"><tr><th className="py-2 pr-3">Church</th><th className="py-2 pr-3">How</th><th className="py-2 pr-3">Until</th><th /></tr></thead>
            <tbody>
              {withLive.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-white/50">None yet.</td></tr>}
              {withLive.map((s) => (
                <tr key={s.churchId} className="border-t border-white/5">
                  <td className="py-2 pr-3">{s.church.name}</td>
                  <td className="py-2 pr-3">{s.mediaInterval === "granted" ? "Gift" : s.mediaIsTrial ? "Free trial" : `Paid (${s.mediaInterval})`}</td>
                  <td className="py-2 pr-3">{dateText(s.mediaUntil!)}</td>
                  <td className="py-2 text-right">
                    {s.mediaInterval === "granted" && (
                      <form action={stopGift}><input type="hidden" name="churchId" value={s.churchId} />
                        <button className="rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/10">End gift now</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-semibold">Computers that have had the free trial</h2>
          <p className="mt-1 text-sm text-white/50">
            Each computer gets one 14-day free trial, whatever email signs up on it, even after Windows is reinstalled.
            Allow another trial only for genuine cases (for example a computer bought second-hand).
          </p>
          <form className="mt-3 flex gap-2">
            <input name="q" defaultValue={q} placeholder="Search by church" className={`${input} flex-1`} />
            <button className="h-10 rounded-lg border border-white/10 px-4 text-sm font-semibold hover:bg-white/10">Search</button>
          </form>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-white/50"><tr><th className="py-2 pr-3">Church</th><th className="py-2 pr-3">Computer</th><th className="py-2 pr-3">Trial started</th><th /></tr></thead>
            <tbody>
              {shownTrials.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-white/50">No trials yet.</td></tr>}
              {shownTrials.map((r) => (
                <tr key={r.machineId} className="border-t border-white/5">
                  <td className="py-2 pr-3">{(r.churchId && churchName.get(r.churchId)) || <span className="text-white/40">Deleted church</span>}</td>
                  <td className="py-2 pr-3">{pcName.get(r.machineId) ?? <span className="font-mono text-xs text-white/40">{r.machineId.slice(0, 12)}…</span>}</td>
                  <td className="py-2 pr-3">{dateText(r.createdAt)}</td>
                  <td className="py-2 text-right">
                    <form action={allowAgain}><input type="hidden" name="machineId" value={r.machineId} />
                      <button className="rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/10">Allow another trial</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </AdminShell>
  );
}
