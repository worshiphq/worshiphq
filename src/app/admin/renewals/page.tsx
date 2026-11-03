import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { db } from "@/lib/db";
import { getPlatformConfig } from "@/lib/data/platform-config";

export const metadata = { title: "Renewals" };
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const GRACE_DAYS = 7;
const date = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-");
const when = (d: Date) => d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const cedi = (n: number) => `₵${Math.round(n).toLocaleString("en-GB")}`;

const KIND_LABEL: Record<string, string> = {
  reminder: "Reminder", expired: "Expired notice", downgraded: "Plan moved", lapsed: "Dropped to Free",
  auto_renewed: "Renewed automatically", auto_renew_failed: "Card charge failed",
  card_saved: "Card saved", card_removed: "Card removed", auto_renew_on: "Auto-renew on", auto_renew_off: "Auto-renew off",
};

export default async function AdminRenewalsPage() {
  const sa = await requireSuperAdmin();
  const now = Date.now();
  const cfg = await getPlatformConfig();
  const priceGhs = (plan: string, interval: string) => {
    const p = cfg.prices[plan];
    return Math.round((interval === "yearly" ? (p?.yearly ?? 0) : (p?.monthly ?? 0)) * cfg.usdToGhsRate);
  };

  const subs = await db.subscription.findMany({
    where: { plan: { not: "free" }, church: { isDemo: false } },
    include: { church: { select: { id: true, name: true, suspended: true } } },
  });

  // Soonest first; anything with no date goes to the top, because that is the one that never expires.
  const rows = subs
    .map((s) => {
      const end = s.renewsAt;
      const msLeft = end ? end.getTime() - now : null;
      return { s, end, daysLeft: msLeft === null ? null : Math.ceil(msLeft / DAY), ended: msLeft !== null && msLeft <= 0, gift: s.status === "grace" };
    })
    .sort((a, b) => {
      if (a.gift !== b.gift) return a.gift ? 1 : -1;
      if (a.end === null && b.end === null) return 0;
      if (a.end === null) return -1;
      if (b.end === null) return 1;
      return a.end.getTime() - b.end.getTime();
    });

  const ids = subs.map((s) => s.churchId);
  const [recent, last, cardCounts] = await Promise.all([
    db.billingEvent.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { church: { select: { name: true } } } }).catch(() => []),
    db.billingEvent
      .findMany({
        where: { churchId: { in: ids }, kind: { in: ["reminder", "expired", "downgraded", "lapsed", "auto_renew_failed", "auto_renewed"] } },
        orderBy: { createdAt: "desc" },
        distinct: ["churchId"],
      })
      .catch(() => []),
    db.savedCard.groupBy({ by: ["churchId"], where: { churchId: { in: ids } }, _count: true }).catch(() => []),
  ]);
  const lastOf = new Map(last.map((e) => [e.churchId, e]));
  const hasCard = new Set(cardCounts.map((c) => c.churchId));

  const live = rows.filter((r) => !r.gift);
  const week = live.filter((r) => r.end && !r.ended && r.daysLeft! <= 7);
  const expired = live.filter((r) => r.ended);
  const noDate = live.filter((r) => !r.end);
  const autoOn = live.filter((r) => r.s.autoRenew && hasCard.has(r.s.churchId)).length;
  const weekTotal = week.reduce((t, r) => t + priceGhs(r.s.plan, r.s.interval), 0);
  const monthTotal = live
    .filter((r) => r.end && !r.ended && r.daysLeft! <= 30)
    .reduce((t, r) => t + priceGhs(r.s.plan, r.s.interval), 0);

  const tiles = [
    { label: "Renewing in 7 days", value: String(week.length), sub: week.length ? `about ${cedi(weekTotal)}` : "nothing due" },
    { label: "Expected in 30 days", value: cedi(monthTotal), sub: "if every church renews" },
    { label: "Expired, in grace", value: String(expired.length), sub: `${GRACE_DAYS} days before Free`, bad: expired.length > 0 },
    { label: "On automatic renewal", value: String(autoOn), sub: `of ${live.length} paid churches` },
  ];

  return (
    <AdminShell email={sa.email} isOwner={sa.role === "owner"}>
      <div className="mb-6">
        <h1 className="text-lg font-bold tracking-tight">Renewals</h1>
        <p className="text-sm text-slate-400">
          Every paid church, soonest renewal first, and what each one has been told. You get one combined email and text when
          churches come within a week of renewing, however many there are.
        </p>
      </div>

      {noDate.length > 0 && (
        <div className="mb-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <b>{noDate.length} paid {noDate.length === 1 ? "church has" : "churches have"} no renewal date</b> ({noDate.map((r) => r.s.church.name).join(", ")}), so
          nothing will ever expire or remind them. Set the plan again from Accounts to give it a date.
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs text-slate-500">{t.label}</div>
            <div className={`mt-1 text-2xl font-bold ${t.bad ? "text-rose-300" : "text-white"}`}>{t.value}</div>
            <div className="text-xs text-slate-500">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02] text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Church</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Renews</th>
              <th className="px-4 py-3 font-medium">Expected</th>
              <th className="px-4 py-3 font-medium">Pays by</th>
              <th className="px-4 py-3 font-medium">Last notice</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, end, daysLeft, ended, gift }) => {
              const n = lastOf.get(s.churchId);
              const tone = gift ? "text-slate-400" : !end ? "text-rose-300" : ended ? "text-rose-300" : daysLeft! <= 7 ? "text-amber-300" : "text-slate-300";
              return (
                <tr key={s.churchId} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-slate-200">
                    {s.church.name}
                    {s.church.suspended && <span className="ml-2 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-300">suspended</span>}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-300">{s.plan} <span className="text-slate-500">{s.interval}</span></td>
                  <td className={`px-4 py-3 ${tone}`}>
                    {gift ? "Gift, never expires" : !end ? "No date set" : (
                      <>
                        {date(end)}{" "}
                        <span className="text-xs">
                          {ended ? `(expired ${Math.abs(daysLeft!)}d ago${s.status === "past_due" ? ", in grace" : ""})` : daysLeft === 0 ? "(today)" : `(${daysLeft}d)`}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{gift ? "-" : cedi(priceGhs(s.plan, s.interval))}</td>
                  <td className="px-4 py-3 text-xs">
                    {gift ? "-" : s.autoRenew && hasCard.has(s.churchId)
                      ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">Card, automatic{s.renewalFailures ? ` (${s.renewalFailures} failed)` : ""}</span>
                      : <span className="text-slate-400">By hand{hasCard.has(s.churchId) ? " (has a card)" : ""}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {n ? (
                      <>
                        {KIND_LABEL[n.kind] ?? n.kind} · {when(n.createdAt)}{" "}
                        <span className={n.delivered ? "text-emerald-400" : "text-rose-400"}>
                          {n.delivered ? (n.channels ? `sent by ${n.channels.replace(",", " + ")}` : "ok") : "NOT delivered"}
                        </span>
                      </>
                    ) : "none yet"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No paid churches yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 mt-8 text-sm font-semibold text-slate-200">Latest billing activity</h2>
      <div className="rounded-2xl border border-white/10">
        {recent.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-500">Nothing yet. Reminders, expiries and card charges will appear here as they happen.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {recent.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="w-32 shrink-0 text-xs text-slate-500">{when(e.createdAt)}</span>
                <span className="min-w-0 flex-1 text-slate-200">
                  <b>{e.church.name}</b> <span className="text-slate-400">· {KIND_LABEL[e.kind] ?? e.kind}</span>
                  {e.detail && <span className="text-slate-500"> · {e.detail}</span>}
                </span>
                <span className={`shrink-0 text-xs ${e.delivered ? "text-emerald-400" : "text-rose-400"}`}>
                  {e.delivered ? (e.channels ? e.channels.replace(",", " + ") : "ok") : "not delivered"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
