import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireSuperAdminOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata = { title: "Audit logs" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "admin", label: "SuperAdmin actions" },
  { key: "churches", label: "Church activity" },
  { key: "texts", label: "WorshipHQ texts" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const PAGE = 50;

const when = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
/** "setChurchPlan" reads as "Set church plan". */
const words = (a: string) => a.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).replace(/ ([A-Z])/g, (_, c: string) => ` ${c.toLowerCase()}`);

type Row = { id: string; at: Date; who: string; what: string; where: string; detail: string; bad?: boolean };

async function load(tab: Tab, q: string, page: number): Promise<{ rows: Row[]; total: number; missing: boolean }> {
  const skip = (page - 1) * PAGE;
  try {
    if (tab === "admin") {
      const where = q ? { OR: [{ action: { contains: q, mode: "insensitive" as const } }, { actorEmail: { contains: q, mode: "insensitive" as const } }, { churchName: { contains: q, mode: "insensitive" as const } }, { detail: { contains: q, mode: "insensitive" as const } }] } : {};
      const [rows, total] = await Promise.all([
        db.adminAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: PAGE }),
        db.adminAuditLog.count({ where }),
      ]);
      return { total, missing: false, rows: rows.map((r) => ({ id: r.id, at: r.createdAt, who: r.actorName || r.actorEmail, what: words(r.action), where: r.churchName ?? "-", detail: r.detail ?? "" })) };
    }
    if (tab === "churches") {
      const where = q ? { OR: [{ action: { contains: q, mode: "insensitive" as const } }, { entity: { contains: q, mode: "insensitive" as const } }, { detail: { contains: q, mode: "insensitive" as const } }, { church: { name: { contains: q, mode: "insensitive" as const } } }, { user: { name: { contains: q, mode: "insensitive" as const } } }] } : {};
      const [rows, total] = await Promise.all([
        db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: PAGE, select: { id: true, createdAt: true, action: true, entity: true, detail: true, church: { select: { name: true } }, user: { select: { name: true } } } }),
        db.auditLog.count({ where }),
      ]);
      return { total, missing: false, rows: rows.map((r) => ({ id: r.id, at: r.createdAt, who: r.user.name, what: `${words(r.action)} ${r.entity}`, where: r.church.name, detail: r.detail ?? "" })) };
    }
    const where = q ? { OR: [{ toNumbers: { contains: q } }, { body: { contains: q, mode: "insensitive" as const } }, { error: { contains: q, mode: "insensitive" as const } }] } : {};
    const [rows, total] = await Promise.all([
      db.platformSmsLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: PAGE }),
      db.platformSmsLog.count({ where }),
    ]);
    return {
      total, missing: false,
      rows: rows.map((r) => ({
        id: r.id, at: r.createdAt, who: r.toNumbers, what: r.sent >= r.recipients ? "Sent" : r.sent > 0 ? `${r.sent} of ${r.recipients} sent` : "Failed",
        where: [r.carrier, r.sender].filter(Boolean).join(", ") || "-", detail: r.error ? `${r.body} (${r.error})` : r.body, bad: r.sent === 0,
      })),
    };
  } catch {
    return { rows: [], total: 0, missing: true };
  }
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const sa = await requireSuperAdminOwner();
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "admin";
  const q = (sp.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const { rows, total, missing } = await load(tab, q, page);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (t: Tab, p = 1, query = q) => `/admin/audit?${new URLSearchParams({ tab: t, ...(query ? { q: query } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`;
  const heads = tab === "texts" ? ["When (UTC)", "To", "Result", "Carrier and sender", "Message"] : tab === "admin" ? ["When (UTC)", "Who", "Action", "Church", "What they entered"] : ["When (UTC)", "Who", "Action", "Church", "Detail"];

  return (
    <AdminShell email={sa.email} isOwner={sa.role === "owner"}>
      <div className="mb-5">
        <h1 className="text-lg font-bold tracking-tight">Audit logs</h1>
        <p className="text-sm text-slate-400">
          Who did what, across the platform. Texts sent by churches are in <Link href="/admin/sms" className="text-teal-300 underline">SMS records</Link>, and SuperAdmin sign-ins are in the <Link href="/admin/access" className="text-teal-300 underline">Access log</Link>.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={href(t.key, 1, "")} className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${tab === t.key ? "bg-teal-500/20 text-teal-200" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>
            {t.label}
          </Link>
        ))}
        <form action="/admin/audit" className="ml-auto flex gap-2">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={q} placeholder="Search" aria-label="Search this log" className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none" />
          <button className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/15">Search</button>
        </form>
      </div>

      {tab === "admin" && <p className="mb-3 text-xs text-slate-500">Recorded the moment an action is used, so a row can also be an attempt that failed on bad input. Passwords, codes, keys and account numbers are never stored.</p>}
      {tab === "texts" && <p className="mb-3 text-xs text-slate-500">Sign-in codes, alerts and notices WorshipHQ sends itself. Codes and links are hidden, because they are live secrets. Recording starts from when this page went live.</p>}

      {missing ? (
        <p className="rounded-xl bg-amber-500/10 p-4 text-sm text-amber-200">This log is not set up yet. Run <b>sql/admin-audit-log.sql</b> in Supabase, then come back.</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-white/10 p-8 text-center text-sm text-slate-400">{q ? "Nothing matches that search." : "Nothing recorded yet."}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs text-slate-500">
              <tr>{heads.map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-400">{when(r.at)}</td>
                  <td className="max-w-48 break-words px-4 py-2.5 text-slate-200">{r.who}</td>
                  <td className={`px-4 py-2.5 ${r.bad ? "text-rose-300" : "text-slate-200"}`}>{r.what}</td>
                  <td className="px-4 py-2.5 text-slate-300">{r.where}</td>
                  <td className="max-w-md break-words px-4 py-2.5 font-mono text-xs text-slate-400">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
          <span>{total.toLocaleString()} entries, page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={href(tab, page - 1)} className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 hover:bg-white/10"><ChevronLeft className="size-4" /> Newer</Link>}
            {page < pages && <Link href={href(tab, page + 1)} className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 hover:bg-white/10">Older <ChevronRight className="size-4" /></Link>}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
