import Link from "next/link";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminShell, AdminCard } from "@/components/admin/admin-shell";
import { AccountActions } from "@/components/admin/account-actions";
import { passwordKey, userPasswordKey, codeKey } from "@/lib/lockout";
import { normalisePhone } from "@/lib/phone";
import { roleLabel } from "@/lib/roles";

export const metadata = { title: "Accounts" };

const PAGE = 20;

export default async function AdminAccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sa = await requireSuperAdmin();
  const { q: rawQ, page: rawPage } = await searchParams;
  const q = (rawQ ?? "").trim();
  const page = Math.max(1, Number(rawPage) || 1);

  const where = {
    isDemo: false,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { users: { some: { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q.replace(/\s/g, "") } }] } } },
          ],
        }
      : {}),
  };
  const [total, churches] = await Promise.all([
    db.church.count({ where }),
    db.church.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: {
        id: true, name: true, city: true, country: true,
        subscription: { select: { plan: true } },
        users: { orderBy: [{ role: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, email: true, phone: true, role: true, passwordHash: true } },
      },
    }),
  ]);

  // Which of these accounts are locked right now (one query for the whole page).
  const keys = churches.flatMap((c) => c.users.flatMap((u) => [`lock:${codeKey(u.id)}`, `lock:${userPasswordKey(u.id)}`, `lock:${passwordKey(u.email)}`, ...(u.phone ? [`lock:${passwordKey(normalisePhone(u.phone))}`] : [])]));
  const locks = keys.length ? await db.rateHit.findMany({ where: { key: { in: keys }, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, select: { key: true } }) : [];
  const lockedKeys = new Set(locks.map((l) => l.key));
  const isLocked = (u: { id: string; email: string; phone: string | null }) =>
    lockedKeys.has(`lock:${codeKey(u.id)}`) || lockedKeys.has(`lock:${userPasswordKey(u.id)}`) || lockedKeys.has(`lock:${passwordKey(u.email)}`) || (!!u.phone && lockedKeys.has(`lock:${passwordKey(normalisePhone(u.phone))}`));

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (p: number) => `/admin/accounts?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) }).toString()}`;

  return (
    <AdminShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Accounts</h1>
        <p className="mt-1 text-sm text-slate-400">Every person who signs in, grouped by church. Send someone a password reset link, or unlock an account that was locked for 24 hours. You are signed in as {sa.role === "owner" ? "the owner" : sa.name}.</p>
      </div>

      <form className="mb-5 flex max-w-lg items-center gap-2" action="/admin/accounts">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input name="q" defaultValue={q} placeholder="Search a church, name, email or phone" className="h-10 w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500/60 focus:outline-none" />
        </div>
        <button className="h-10 rounded-lg bg-teal-500 px-4 text-sm font-semibold text-slate-950 hover:bg-teal-400">Search</button>
      </form>

      {churches.length === 0 ? (
        <AdminCard className="p-8 text-center text-sm text-slate-400">No accounts match that.</AdminCard>
      ) : (
        <div className="space-y-4">
          {churches.map((c) => (
            <AdminCard key={c.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="font-semibold text-slate-100">{c.name}</div>
                <div className="text-xs text-slate-400">
                  {[c.city, c.country].filter(Boolean).join(", ")} · {c.subscription?.plan ?? "free"} plan · {c.users.length} {c.users.length === 1 ? "account" : "accounts"}
                </div>
              </div>
              <div className="divide-y divide-white/10">
                {c.users.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-100">
                        {u.name}
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-slate-300">{roleLabel(u.role)}</span>
                        {!u.passwordHash && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">No password yet</span>}
                        {isLocked(u) && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-300">Locked for 24 hours</span>}
                      </div>
                      <div className="break-all text-xs text-slate-500">{u.email.endsWith("@invite.worshiphq.app") ? "no email" : u.email}{u.phone ? ` · ${u.phone}` : ""}</div>
                    </div>
                    <AccountActions userId={u.id} locked={isLocked(u)} />
                  </div>
                ))}
                {c.users.length === 0 && <div className="px-4 py-3 text-sm text-slate-500">No accounts.</div>}
              </div>
            </AdminCard>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm text-slate-400">
          <span>Page {page} of {pages} · {total} churches</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={link(page - 1)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5"><ChevronLeft className="size-4" /> Previous</Link>}
            {page < pages && <Link href={link(page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5">Next <ChevronRight className="size-4" /></Link>}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
