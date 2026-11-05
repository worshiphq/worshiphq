import { Pager } from "@/components/admin/pager";
import { paging, readPage } from "@/lib/admin-paging";
import Link from "@/components/ui/app-link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { getSmsLog, getSmsLogTotals, getCreditAdjustments, SMS_LOG_PAGE_SIZE } from "@/lib/data/sms-audit";
import { AdminSmsLogRows } from "@/components/admin/sms-log-rows";
import { SmsCarrierSwitch } from "@/components/admin/sms-carrier-switch";
import { db } from "@/lib/db";
import { naloConfigured } from "@/lib/sms/routing";

export const metadata = { title: "SMS records" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "Everything" },
  { key: "manual", label: "By a team member" },
  { key: "automatic", label: "Automatic" },
  { key: "failed", label: "Nothing sent" },
] as const;

const DAY = 86_400_000;

export default async function AdminSmsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; filter?: string; q?: string; apage?: string }>;
}) {
  const sa = await requireSuperAdmin();
  const sp = await searchParams;
  const filter = FILTERS.some((f) => f.key === sp.filter) ? sp.filter! : "all";

  const [log, allTime, last30, adjustments, onNalo, totalChurches] = await Promise.all([
    getSmsLog({ page: parseInt(sp.page ?? "1", 10) || 1, filter, q: sp.q }),
    getSmsLogTotals(),
    getSmsLogTotals(undefined, new Date(Date.now() - 30 * DAY)),
    getCreditAdjustments(),
    db.church.count({ where: { isDemo: false, smsProvider: "nalo" } }),
    db.church.count({ where: { isDemo: false } }),
  ]);

  const ap = paging(adjustments.length, readPage(sp.apage), 10);
  const shownAdj = adjustments.slice(ap.skip, ap.skip + ap.size);
  const href = (p: number, f = filter) =>
    `/admin/sms?${new URLSearchParams({
      ...(f !== "all" ? { filter: f } : {}),
      ...(sp.q ? { q: sp.q } : {}),
      ...(p > 1 ? { page: String(p) } : {}),
    }).toString()}`;

  const stats = [
    { label: "Sends, all time", value: allTime.sends },
    { label: "Messages sent", value: allTime.delivered },
    { label: "Credits used", value: allTime.credits },
    { label: "Sends in the last 30 days", value: last30.sends },
    { label: "Sends where nothing went out", value: allTime.failed, bad: allTime.failed > 0 },
  ];

  return (
    <AdminShell email={sa.email} isOwner={sa.role === "owner"}>
      <div className="mb-6">
        <h1 className="text-lg font-bold tracking-tight">SMS records</h1>
        <p className="text-sm text-slate-400">
          Every text any church has sent through WorshipHQ: what it said, who it reached, and what it cost them.
          Churches on Pro and above read their own records in Communications.
        </p>
      </div>

      <SmsCarrierSwitch hubtel={totalChurches - onNalo} nalo={onNalo} naloReady={naloConfigured()} />

      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className={`mt-1 text-2xl font-bold ${s.bad ? "text-rose-300" : "text-white"}`}>
              {s.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {adjustments.length > 0 && (
        <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-200">Credits you gave or took back</h2>
            <p className="text-xs text-slate-500">Your reason is here only. The church's own history just says credits were granted or removed.</p>
          </div>
          <div className="divide-y divide-white/5">
            {shownAdj.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className={`w-20 shrink-0 text-right font-semibold tabular-nums ${a.credits < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                  {a.credits > 0 ? "+" : ""}{a.credits.toLocaleString()}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-200">
                  {a.churchName}
                  {a.adminNote && <span className="text-slate-500"> · {a.adminNote}</span>}
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  left {a.balanceAfter.toLocaleString()} · {a.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </span>
              </div>
            ))}
          </div>
          <div className="px-4 pb-3">
            <Pager page={ap.page} pages={ap.pages} total={ap.total} size={ap.size} path="/admin/sms" pageParam="apage" params={{ filter: filter !== "all" ? filter : undefined, q: sp.q, page: sp.page }} />
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href(1, f.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.key ? "border-teal-400/50 bg-teal-500/15 text-teal-200" : "border-white/10 text-slate-400 hover:bg-white/5"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form action="/admin/sms" className="flex-1 min-w-[220px]">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search by church or what was sent"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none"
          />
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        </form>
      </div>

      <div className="rounded-2xl border border-white/10">
        {!log.ready ? (
          <div className="px-4 py-10 text-center text-slate-500">
            The SmsAuditLog table has not been created yet. Run sql/sms-audit-log.sql.
          </div>
        ) : (
          <AdminSmsLogRows rows={log.rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} />
        )}

        {log.pages > 1 && (
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-sm">
            <span className="text-slate-500">
              {(log.page - 1) * SMS_LOG_PAGE_SIZE + 1} to {Math.min(log.page * SMS_LOG_PAGE_SIZE, log.total)} of {log.total}
            </span>
            <div className="flex items-center gap-2">
              {log.page > 1 ? (
                <Link href={href(log.page - 1)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/5">
                  <ChevronLeft className="size-3.5" /> Newer
                </Link>
              ) : <span />}
              <span className="text-xs text-slate-400">Page {log.page} of {log.pages}</span>
              {log.page < log.pages ? (
                <Link href={href(log.page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/5">
                  Older <ChevronRight className="size-3.5" />
                </Link>
              ) : <span />}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
