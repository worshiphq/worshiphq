import { Building2, Users, HandCoins, TrendingUp, UserCog, Activity } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { getChurchesPage, getPlatformStats } from "@/lib/data/admin";
import { readPage } from "@/lib/admin-paging";
import { AdminShell, AdminCard } from "@/components/admin/admin-shell";
import { ChurchTable } from "@/components/admin/church-table";
import { RunAutomationsButton } from "@/components/admin/run-automations-button";

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; sort?: string; dir?: string; plan?: string; status?: string }> }) {
  const sa = await requireSuperAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const [list, stats] = await Promise.all([getChurchesPage({ page: readPage(sp.page), q, sort: sp.sort, dir: sp.dir, plan: sp.plan, status: sp.status }), getPlatformStats()]);

  const kpis = [
    { label: "Churches", value: stats.churches, icon: Building2, hint: `${stats.activeChurches} active` },
    { label: "Members", value: stats.members.toLocaleString(), icon: Users, hint: "across all churches" },
    { label: "Team users", value: stats.users.toLocaleString(), icon: UserCog, hint: "leaders & staff" },
    { label: "Giving (mo)", value: `₵${stats.givingThisMonth.toLocaleString()}`, icon: HandCoins, hint: "this month" },
    { label: "New signups", value: stats.signupsThisMonth, icon: TrendingUp, hint: "this month" },
  ];

  const maxTrend = Math.max(1, ...stats.trend.map((t) => t.churches));

  return (
    <AdminShell email={sa.email} isOwner={sa.role === "owner"}>
      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <AdminCard key={k.label} className="p-4">
            <k.icon className="mb-2 size-5 text-teal-400" />
            <div className="text-2xl font-bold tracking-tight">{k.value}</div>
            <div className="text-xs text-slate-400">{k.label}</div>
            <div className="mt-0.5 text-[11px] text-slate-600">{k.hint}</div>
          </AdminCard>
        ))}
      </div>

      {/* Automations control */}
      <AdminCard className="mb-6 p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Activity className="size-4 text-teal-400" /> Automations
        </div>
        <p className="mb-3 text-xs text-slate-400">
          Scheduled sends (birthdays, roster & group reminders, pledge reminders) run on the daily cron.
          Fire them all now to test or catch up.
        </p>
        <RunAutomationsButton />
      </AdminCard>

      {/* Signup trend */}
      <AdminCard className="mb-8 p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Activity className="size-4 text-teal-400" /> New churches · last 6 months
        </div>
        <div className="flex h-32 items-end gap-3">
          {stats.trend.map((t) => (
            <div key={t.month} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-teal-500/40 to-teal-400"
                  style={{ height: `${(t.churches / maxTrend) * 100}%`, minHeight: t.churches > 0 ? "4px" : "0" }}
                />
              </div>
              <div className="text-xs text-slate-500">{t.month}</div>
              <div className="-mt-1 text-[11px] font-medium text-slate-400">{t.churches}</div>
            </div>
          ))}
        </div>
      </AdminCard>

      <ChurchTable churches={list.rows} q={q} total={list.total} page={list.page} pages={list.pages} size={list.size} params={{ sort: sp.sort, dir: sp.dir, plan: sp.plan, status: sp.status }} />
    </AdminShell>
  );
}
