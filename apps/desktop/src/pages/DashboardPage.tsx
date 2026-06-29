import { useEffect, useState } from "react";
import { Users, HandCoins, CalendarCheck2, TrendingUp } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency } from "../lib/utils";

interface Stats {
  totalMembers: number;
  activeMembers: number;
  totalGiving: number;
  recentAttendance: number;
}

export function DashboardPage() {
  const { session } = useAppStore();
  const [stats, setStats] = useState<Stats>({ totalMembers: 0, activeMembers: 0, totalGiving: 0, recentAttendance: 0 });
  const [recentPeople, setRecentPeople] = useState<any[]>([]);

  useEffect(() => {
    if (!session?.churchId) return;
    loadStats();
  }, [session?.churchId]);

  async function loadStats() {
    const churchId = session!.churchId;

    const [members, active, giving, attendance, recent] = await Promise.all([
      db.rawQuery("SELECT COUNT(*) as cnt FROM person WHERE church_id = ?", [churchId]),
      db.rawQuery("SELECT COUNT(*) as cnt FROM person WHERE church_id = ? AND status = 'active'", [churchId]),
      db.rawQuery("SELECT COALESCE(SUM(amount), 0) as total FROM gift WHERE church_id = ?", [churchId]),
      db.rawQuery("SELECT COALESCE(SUM(adults + teens + children + visitors), 0) as total FROM attendance_session WHERE church_id = ? ORDER BY date DESC LIMIT 4", [churchId]),
      db.rawQuery("SELECT * FROM person WHERE church_id = ? ORDER BY joined_at DESC LIMIT 5", [churchId]),
    ]);

    setStats({
      totalMembers: members[0]?.cnt || 0,
      activeMembers: active[0]?.cnt || 0,
      totalGiving: giving[0]?.total || 0,
      recentAttendance: attendance[0]?.total || 0,
    });
    setRecentPeople(recent);
  }

  const cards = [
    { label: "Total Members", value: stats.totalMembers, icon: Users, color: "text-primary-bright", bg: "bg-primary-soft" },
    { label: "Active Members", value: stats.activeMembers, icon: TrendingUp, color: "text-success", bg: "bg-success/10" },
    { label: "Total Giving", value: formatCurrency(stats.totalGiving), icon: HandCoins, color: "text-gold", bg: "bg-gold/10" },
    { label: "Recent Attendance", value: stats.recentAttendance, icon: CalendarCheck2, color: "text-sky-500", bg: "bg-sky-500/10" },
  ];

  return (
    <PageShell title="Dashboard">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {cards.map((card) => (
          <div key={card.label} className="card flex items-center gap-4">
            <div className={`grid size-11 place-items-center rounded-xl ${card.bg}`}>
              <card.icon className={`size-5 ${card.color}`} />
            </div>
            <div>
              <p className="text-[11px] text-ink-muted">{card.label}</p>
              <p className="text-xl font-bold text-ink">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent members */}
      <div className="card">
        <h2 className="mb-3 text-sm font-bold text-ink">Recent Members</h2>
        {recentPeople.length === 0 ? (
          <p className="text-sm text-ink-faint py-6 text-center">
            No members yet. Sync with your WorshipHQ account or add members manually.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {recentPeople.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5">
                <div className="grid size-8 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary-bright">
                  {p.first_name[0]}{p.last_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{p.first_name} {p.last_name}</p>
                  <p className="text-[11px] text-ink-faint">{p.phone || p.email || "No contact"}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.status === "active" ? "bg-success/10 text-success" : "bg-surface-3 text-ink-faint"}`}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
