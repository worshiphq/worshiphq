import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, HandCoins, CalendarCheck2, TrendingUp, Plus, UserPlus, Gift, Cake,
  Clock, ArrowRight, Loader2, ExternalLink,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, formatDate, timeAgo } from "../lib/utils";

export function DashboardPage() {
  const { session, syncVersion } = useAppStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, giving: 0, attendance: 0, visitors: 0, departments: 0 });
  const [recentPeople, setRecentPeople] = useState<any[]>([]);
  const [birthdays, setBirthdays] = useState<any[]>([]);
  const [recentGifts, setRecentGifts] = useState<any[]>([]);

  useEffect(() => {
    if (session?.churchId) loadAll();
  }, [session?.churchId, syncVersion]);

  async function loadAll() {
    setLoading(true);
    const cid = session!.churchId;
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    const [total, active, giving, att, vis, depts, recent, bdays, gifts] = await Promise.all([
      db.rawQuery("SELECT COUNT(*) as c FROM person WHERE church_id = ?", [cid]),
      db.rawQuery("SELECT COUNT(*) as c FROM person WHERE church_id = ? AND status = 'active'", [cid]),
      db.rawQuery("SELECT COALESCE(SUM(amount),0) as t FROM gift WHERE church_id = ?", [cid]),
      db.rawQuery("SELECT COALESCE(SUM(adults+teens+children+visitors),0) as t FROM attendance_session WHERE church_id = ? ORDER BY date DESC LIMIT 4", [cid]),
      db.rawQuery("SELECT COUNT(*) as c FROM person WHERE church_id = ? AND status = 'visitor'", [cid]),
      db.rawQuery("SELECT COUNT(*) as c FROM department WHERE church_id = ?", [cid]),
      db.rawQuery("SELECT * FROM person WHERE church_id = ? ORDER BY joined_at DESC LIMIT 6", [cid]),
      db.rawQuery(`SELECT * FROM person WHERE church_id = ? AND date_of_birth IS NOT NULL AND substr(date_of_birth, 6, 5) >= '${month}-${day}' ORDER BY substr(date_of_birth, 6, 5) LIMIT 5`, [cid]),
      db.rawQuery("SELECT g.*, p.first_name, p.last_name, p.photo_url FROM gift g LEFT JOIN person p ON g.person_id = p.id WHERE g.church_id = ? ORDER BY g.date DESC LIMIT 5", [cid]),
    ]);

    setStats({
      total: total[0]?.c || 0,
      active: active[0]?.c || 0,
      giving: giving[0]?.t || 0,
      attendance: att[0]?.t || 0,
      visitors: vis[0]?.c || 0,
      departments: depts[0]?.c || 0,
    });
    setRecentPeople(recent);
    setBirthdays(bdays);
    setRecentGifts(gifts);
    setLoading(false);
  }

  const quickActions = [
    { label: "Add Member", icon: UserPlus, to: "/people", color: "bg-primary-soft text-primary-bright" },
    { label: "Record Gift", icon: Gift, to: "/giving", color: "bg-gold/10 text-gold" },
    { label: "Attendance", icon: CalendarCheck2, to: "/attendance", color: "bg-info/10 text-info" },
    { label: "Events", icon: Clock, to: "/events", color: "bg-success/10 text-success" },
  ];

  if (loading) {
    return (
      <PageShell title="Dashboard">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-8 text-primary-bright whq-spin" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Dashboard">
      <PageHeader title={`Welcome back, ${session?.userName?.split(" ")[0] || "Admin"}`}
        description={`Here's what's happening at ${session?.churchName || "your church"}.`}>
        <button onClick={() => window.api?.openExternal("https://worshiphq.app/dashboard")}
          className="btn-ghost btn-sm">
          <ExternalLink className="size-3.5" /> Open web
        </button>
      </PageHeader>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        <StatCard label="Total Members" value={stats.total} icon={Users} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Active Members" value={stats.active} icon={TrendingUp} color="bg-success/10 text-success" />
        <StatCard label="Total Giving" value={formatCurrency(stats.giving)} icon={HandCoins} color="bg-gold/10 text-gold" />
        <StatCard label="Last Attendance" value={stats.attendance} icon={CalendarCheck2} color="bg-info/10 text-info" />
      </div>

      {/* Quick actions */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        {quickActions.map((a) => (
          <button key={a.label} onClick={() => navigate(a.to)}
            className="card-hover flex items-center gap-3 text-left">
            <span className={`grid size-10 place-items-center rounded-xl ${a.color}`}>
              <a.icon className="size-4" />
            </span>
            <span className="text-sm font-semibold text-ink">{a.label}</span>
            <ArrowRight className="ml-auto size-4 text-ink-faint" />
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Recent members */}
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">New Members</h2>
            <button onClick={() => navigate("/people")} className="text-[11px] font-medium text-primary-bright hover:underline">View all</button>
          </div>
          {recentPeople.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">No members yet</p>
          ) : (
            <div className="space-y-2">
              {recentPeople.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-2/50">
                  <Avatar name={`${p.first_name} ${p.last_name}`} src={p.photo_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{p.first_name} {p.last_name}</p>
                    <p className="text-[10px] text-ink-faint">{p.phone || p.email || "No contact"}</p>
                  </div>
                  <span className={`badge ${p.status === "active" ? "badge-success" : p.status === "visitor" ? "badge-info" : "badge-muted"}`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Birthdays */}
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <Cake className="size-4 text-gold" /> Upcoming Birthdays
            </h2>
            <button onClick={() => navigate("/birthdays")} className="text-[11px] font-medium text-primary-bright hover:underline">View all</button>
          </div>
          {birthdays.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">No upcoming birthdays</p>
          ) : (
            <div className="space-y-2">
              {birthdays.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-2/50">
                  <Avatar name={`${p.first_name} ${p.last_name}`} src={p.photo_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{p.first_name} {p.last_name}</p>
                    <p className="text-[10px] text-gold font-medium">{formatDate(p.date_of_birth)}</p>
                  </div>
                  <Cake className="size-4 text-gold/50" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent giving */}
        <div className="card col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">Recent Giving</h2>
            <button onClick={() => navigate("/giving")} className="text-[11px] font-medium text-primary-bright hover:underline">View all</button>
          </div>
          {recentGifts.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">No gifts recorded yet</p>
          ) : (
            <div className="space-y-2">
              {recentGifts.map((g) => {
                const name = g.first_name ? `${g.first_name} ${g.last_name}` : g.donor_name || "Anonymous";
                return (
                  <div key={g.id} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-2/50">
                    <Avatar name={name} src={g.photo_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{name}</p>
                      <p className="text-[10px] text-ink-faint">{g.method?.replace("_", " ")} · {formatDate(g.date)}</p>
                    </div>
                    <span className="text-sm font-bold text-success">{formatCurrency(g.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
