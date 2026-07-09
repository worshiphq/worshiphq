import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, HandCoins, CalendarCheck2, MessageSquare, Plus, UserPlus, Gift, Cake,
  Clock, ChevronRight, Loader2, ExternalLink, Crown, Heart, Send, TrendingUp, Layers,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { PageTips } from "../components/Tour";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, formatDate } from "../lib/utils";

const DEPT_COLORS = ["#6D5EF8", "#0d7377", "#e74c3c", "#3498db", "#27ae60", "#f39c12", "#8e44ad", "#1abc9c"];

export function DashboardPage() {
  const { session, syncVersion } = useAppStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ active: 0, weeklyAtt: 0, monthlyGiving: 0, messageReach: 0 });
  const [recentPeople, setRecentPeople] = useState<any[]>([]);
  const [birthdays, setBirthdays] = useState<any[]>([]);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [careTasks, setCareTasks] = useState<any[]>([]);
  const [deptBreakdown, setDeptBreakdown] = useState<{ name: string; count: number }[]>([]);
  const [givingTrend, setGivingTrend] = useState<{ label: string; value: number }[]>([]);
  const [attTrend, setAttTrend] = useState<{ label: string; value: number }[]>([]);
  const [kpiTrends, setKpiTrends] = useState<{ members: number | undefined; attendance: number | undefined; giving: number | undefined; messages: number | undefined }>({ members: undefined, attendance: undefined, giving: undefined, messages: undefined });

  useEffect(() => {
    if (session?.churchId) loadAll();
  }, [session?.churchId, syncVersion]);

  async function loadAll() {
    setLoading(true);
    const cid = session!.churchId;
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const monthStart = `${now.getFullYear()}-${month}-01`;

    // Previous month date range for trend calculations
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth2 = String(prevMonthDate.getMonth() + 1).padStart(2, "0");
    const prevMonthStart = `${prevMonthDate.getFullYear()}-${prevMonth2}-01`;
    const prevMonthEnd = `${now.getFullYear()}-${month}-01`;

    const [active, weeklyAtt, monthGiving, msgReach, recent, bdays, lead, evts, care, depts, gTrend, aTrend,
      prevMembers, prevAtt, prevGiving, prevMsg] = await Promise.all([
      db.rawQuery("SELECT COUNT(*) as c FROM person WHERE church_id = ? AND status = 'active'", [cid]),
      db.rawQuery("SELECT COALESCE(SUM(adults+teens+children+visitors),0) as t FROM attendance_session WHERE church_id = ? AND date >= date('now','-7 days')", [cid]),
      db.rawQuery("SELECT COALESCE(SUM(amount),0) as t FROM gift WHERE church_id = ? AND date >= ?", [cid, monthStart]),
      db.rawQuery("SELECT COALESCE(SUM(sent),0) as t FROM communication WHERE church_id = ?", [cid]),
      db.rawQuery(`SELECT p.*, d.name as dept_name FROM person p LEFT JOIN department d ON p.department_id = d.id WHERE p.church_id = ? ORDER BY p.joined_at DESC LIMIT 6`, [cid]),
      db.rawQuery(`SELECT * FROM person WHERE church_id = ? AND date_of_birth IS NOT NULL AND substr(date_of_birth, 6, 5) = '${month}-${day}' LIMIT 6`, [cid]),
      db.rawQuery("SELECT * FROM person WHERE church_id = ? AND featured = 1 ORDER BY leader_sort_order ASC LIMIT 6", [cid]),
      db.rawQuery("SELECT * FROM event WHERE church_id = ? AND starts_at >= date('now') ORDER BY starts_at ASC LIMIT 5", [cid]),
      db.rawQuery(`SELECT f.*, p.first_name, p.last_name FROM follow_up f LEFT JOIN person p ON f.person_id = p.id WHERE f.church_id = ? AND f.status != 'done' ORDER BY f.due_date ASC LIMIT 5`, [cid]),
      db.rawQuery(`SELECT d.name, COUNT(p.id) as count FROM department d LEFT JOIN person p ON p.department_id = d.id AND p.church_id = d.church_id WHERE d.church_id = ? GROUP BY d.id ORDER BY count DESC LIMIT 8`, [cid]),
      db.rawQuery(`SELECT strftime('%Y-%m', date) as ym, COALESCE(SUM(amount),0) as total FROM gift WHERE church_id = ? AND date >= date('now','-6 months') GROUP BY ym ORDER BY ym ASC`, [cid]),
      db.rawQuery(`SELECT strftime('%Y-%m', date) as ym, COALESCE(SUM(adults+teens+children+visitors),0) as total FROM attendance_session WHERE church_id = ? AND date >= date('now','-6 months') GROUP BY ym ORDER BY ym ASC`, [cid]),
      // Previous month: members who joined last month
      db.rawQuery("SELECT COUNT(*) as c FROM person WHERE church_id = ? AND status = 'active' AND joined_at >= ? AND joined_at < ?", [cid, prevMonthStart, prevMonthEnd]),
      // Previous month: attendance (week before last 7 days)
      db.rawQuery("SELECT COALESCE(SUM(adults+teens+children+visitors),0) as t FROM attendance_session WHERE church_id = ? AND date >= date('now','-14 days') AND date < date('now','-7 days')", [cid]),
      // Previous month: giving
      db.rawQuery("SELECT COALESCE(SUM(amount),0) as t FROM gift WHERE church_id = ? AND date >= ? AND date < ?", [cid, prevMonthStart, prevMonthEnd]),
      // Previous month: messages (compare last 30 days vs 30 days before)
      db.rawQuery("SELECT COALESCE(SUM(sent),0) as t FROM communication WHERE church_id = ? AND created_at >= date('now','-60 days') AND created_at < date('now','-30 days')", [cid]),
    ]);

    setStats({
      active: active[0]?.c || 0,
      weeklyAtt: weeklyAtt[0]?.t || 0,
      monthlyGiving: monthGiving[0]?.t || 0,
      messageReach: msgReach[0]?.t || 0,
    });

    // Calculate KPI trend percentages (current vs previous period)
    const calcTrend = (current: number, previous: number): number | undefined => {
      if (previous === 0 && current === 0) return undefined;
      if (previous === 0) return 100;
      return Math.round(((current - previous) / previous) * 100);
    };

    // Members trend: new members this month vs members who joined last month
    const thisMonthNewMembers = await db.rawQuery(
      "SELECT COUNT(*) as c FROM person WHERE church_id = ? AND status = 'active' AND joined_at >= ?", [cid, monthStart]
    );
    const membersThisMonth = thisMonthNewMembers[0]?.c || 0;
    const membersLastMonth = prevMembers[0]?.c || 0;

    setKpiTrends({
      members: calcTrend(membersThisMonth, membersLastMonth),
      attendance: calcTrend(weeklyAtt[0]?.t || 0, prevAtt[0]?.t || 0),
      giving: calcTrend(monthGiving[0]?.t || 0, prevGiving[0]?.t || 0),
      messages: calcTrend(msgReach[0]?.t || 0, prevMsg[0]?.t || 0),
    });
    setRecentPeople(recent);
    setBirthdays(bdays);
    setLeaders(lead);
    setEvents(evts);
    setCareTasks(care);
    setDeptBreakdown(depts.filter((d: any) => d.count > 0).map((d: any) => ({ name: d.name, count: d.count })));
    const fmtMonth = (ym: string) => { const [y, m] = ym.split("-"); return new Date(+y, +m - 1).toLocaleDateString("en-GB", { month: "short" }); };
    setGivingTrend(gTrend.map((r: any) => ({ label: fmtMonth(r.ym), value: r.total })));
    setAttTrend(aTrend.map((r: any) => ({ label: fmtMonth(r.ym), value: r.total })));
    setLoading(false);
  }

  const quickActions = [
    { label: "Add Member", icon: UserPlus, to: "/people", color: "bg-primary-soft text-primary-bright" },
    { label: "Record Gift", icon: Gift, to: "/giving", color: "bg-gold/10 text-gold" },
    { label: "Send SMS", icon: Send, to: "/communications", color: "bg-info/10 text-info" },
    { label: "New Event", icon: CalendarCheck2, to: "/events", color: "bg-success/10 text-success" },
  ];

  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

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
      <PageHeader title={`${greeting}, ${session?.userName?.split(" ")[0] || "Admin"}`}
        description={`Here's what's happening at ${session?.churchName || "your church"}.`}>
        <button onClick={() => window.api?.openExternal("https://worshiphq.app/app")} className="btn-ghost btn-sm">
          <ExternalLink className="size-3.5" /> Open web
        </button>
      </PageHeader>

      <PageTips tourId="desktop-dashboard" steps={[
        { target: "dash-kpis", title: "Your church at a glance", body: "These cards show your key metrics. Trends compare to last month." },
        { target: "dash-actions", title: "Quick actions", body: "Jump straight to adding members, recording attendance, or logging giving." },
        { target: "dash-leadership", title: "Church leadership", body: "Your featured leaders appear here. Manage them from the Leaders page." },
      ]} />

      {/* KPI cards */}
      <div data-tour="dash-kpis" className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Members" value={stats.active} icon={Users} color="text-primary-bright" trend={kpiTrends.members} />
        <StatCard label="Weekly Attendance" value={stats.weeklyAtt} icon={CalendarCheck2} color="text-success" trend={kpiTrends.attendance} />
        <StatCard label="Monthly Giving" value={formatCurrency(stats.monthlyGiving)} icon={HandCoins} color="text-gold" trend={kpiTrends.giving} />
        <StatCard label="Message Reach" value={stats.messageReach} icon={MessageSquare} color="text-info" trend={kpiTrends.messages} />
      </div>

      {/* Quick actions */}
      <div data-tour="dash-actions" className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {quickActions.map((a) => (
          <button key={a.label} onClick={() => navigate(a.to)} className="rounded-2xl border border-line bg-surface p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/25 hover:shadow-md flex items-center gap-3 text-left">
            <span className={`grid size-10 place-items-center rounded-xl ${a.color}`}><a.icon className="size-4" /></span>
            <span className="text-sm font-semibold text-ink">{a.label}</span>
          </button>
        ))}
      </div>

      {/* Featured leaders */}
      {leaders.length > 0 && (
        <div data-tour="dash-leadership" className="card mb-6">
          <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <Crown className="size-4 text-gold" /> Church Leadership
            </h2>
            <button onClick={() => navigate("/leaders")} className="flex items-center gap-1 text-[11px] font-medium text-primary-bright hover:underline">
              View all <ChevronRight className="size-3" />
            </button>
          </div>
          <div className="flex flex-wrap gap-6">
            {leaders.map((l, i) => (
              <div key={l.id} className="flex flex-col items-center text-center">
                <Avatar name={`${l.first_name} ${l.last_name}`} src={l.photo_url} size={i === 0 ? "xl" : "lg"}
                  className={i === 0 ? "ring-4 ring-gold/30" : ""} />
                <p className={`mt-2 font-semibold text-ink ${i === 0 ? "text-sm" : "text-xs"}`}>{l.first_name} {l.last_name}</p>
                {l.leader_title && (
                  <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${i === 0 ? "bg-gold/10 text-gold" : "bg-primary-soft text-primary-bright"}`}>
                    {l.leader_title}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Giving Trend</h2>
              <p className="text-[11px] text-ink-muted">Monthly giving over the last 6 months</p>
            </div>
            <TrendingUp className="size-4 text-success" />
          </div>
          <LineChart data={givingTrend} color="#27ae60" prefix="₵" />
        </div>
        <div className="card">
          <h2 className="font-display text-lg font-semibold text-ink">Attendance</h2>
          <p className="text-[11px] text-ink-muted mb-2">By month</p>
          <BarChart data={attTrend} color="#6D5EF8" />
        </div>
      </div>

      {/* Membership donut + recent members */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Membership</h2>
            <span className="text-xl font-bold text-primary-bright">{stats.active}</span>
          </div>
          <p className="text-[11px] text-ink-muted">By department</p>
          <Donut data={deptBreakdown} />
        </div>
        <div className="card col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Recent Members</h2>
            <button onClick={() => navigate("/people")} className="text-[11px] font-medium text-primary-bright hover:underline">View all</button>
          </div>
          {recentPeople.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">No members yet</p>
          ) : (
            <div className="space-y-1">
              {recentPeople.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-surface-2/50">
                  <div className="flex items-center gap-3">
                    <Avatar name={`${p.first_name} ${p.last_name}`} src={p.photo_url} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-ink">{p.first_name} {p.last_name}</p>
                      <p className="text-[10px] text-ink-faint">{p.dept_name || "No department"}</p>
                    </div>
                  </div>
                  <span className={`badge ${p.status === "active" ? "badge-success" : p.status === "visitor" ? "badge-info" : "badge-muted"}`}>{p.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: birthdays, events, follow-ups */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Cake className="size-4 text-gold" /> Celebrations
          </h2>
          {birthdays.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">No birthdays today</p>
          ) : (
            <div className="space-y-1">
              {birthdays.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2/50">
                  <Avatar name={`${p.first_name} ${p.last_name}`} src={p.photo_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{p.first_name} {p.last_name}</p>
                    <p className="text-[10px] text-gold font-medium">Birthday today</p>
                  </div>
                  <button
                    title={p.phone ? `Send birthday SMS to ${p.first_name}` : `Copy ${p.first_name}'s name`}
                    className="grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-primary-bright transition-colors hover:bg-primary-soft hover:border-primary/30"
                    onClick={() => {
                      if (p.phone) {
                        const msg = encodeURIComponent(`Happy Birthday, ${p.first_name}! 🎂 Wishing you a blessed day from ${session?.churchName || "your church family"}.`);
                        window.api?.openExternal(`sms:${p.phone}?body=${msg}`);
                      } else {
                        navigator.clipboard.writeText(`${p.first_name} ${p.last_name}`);
                        // Toast fallback — show a brief visual cue
                        const el = document.getElementById(`bday-btn-${p.id}`);
                        if (el) { el.textContent = "✓"; setTimeout(() => { el.textContent = ""; }, 1200); }
                      }
                    }}
                  >
                    <Send id={`bday-btn-${p.id}`} className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink"><Clock className="size-4 text-primary-bright" /> Upcoming</h2>
            <button onClick={() => navigate("/events")} className="text-[11px] font-medium text-primary-bright hover:underline">View all</button>
          </div>
          {events.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">No upcoming events</p>
          ) : (
            <div className="space-y-1">
              {events.map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2/50">
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-gradient-to-br from-primary/10 to-primary/5 text-center">
                    <span className="block text-sm font-bold leading-none">{new Date(e.starts_at).getDate()}</span>
                    <span className="text-[9px] uppercase text-ink-faint">{new Date(e.starts_at).toLocaleDateString("en-GB", { month: "short" })}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{e.title}</p>
                    <p className="text-[10px] text-ink-faint">{new Date(e.starts_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink"><Heart className="size-4 text-danger" /> Follow-up</h2>
          {careTasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">No follow-ups right now</p>
          ) : (
            <div className="space-y-1">
              {careTasks.map((t) => (
                <div key={t.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface-2/50">
                  <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${t.status === "open" ? "bg-danger" : "bg-warning"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{t.first_name ? `${t.first_name} ${t.last_name}` : t.title}</p>
                    <p className="text-xs text-ink-muted">{t.title}</p>
                  </div>
                  {t.due_date && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-ink-faint">{formatDate(t.due_date)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

/* ── Lightweight SVG charts (no external dependency) ── */
function LineChart({ data, color, prefix = "" }: { data: { label: string; value: number }[]; color: string; prefix?: string }) {
  if (data.length === 0) return <EmptyChart />;
  const w = 480, hgt = 140, pad = 24;
  const max = Math.max(...data.map((d) => d.value), 1);
  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const pts = data.map((d, i) => [pad + i * step, hgt - pad - (d.value / max) * (hgt - pad * 2)]);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  const area = `${path} L${pts[pts.length - 1][0]},${hgt - pad} L${pts[0][0]},${hgt - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${hgt}`} className="w-full" preserveAspectRatio="none" style={{ height: 140 }}>
      <path d={area} fill={color} opacity={0.1} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={color} />)}
      {data.map((d, i) => (
        <text key={i} x={pad + i * step} y={hgt - 6} textAnchor="middle" fontSize={9} fill="currentColor" className="text-ink-faint">{d.label}</text>
      ))}
    </svg>
  );
}

function BarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  if (data.length === 0) return <EmptyChart />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height: 140 }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
          <div className="w-full rounded-t" style={{ height: `${Math.max((d.value / max) * 110, 2)}px`, background: color }} />
          <span className="text-[9px] text-ink-faint">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function Donut({ data }: { data: { name: string; count: number }[] }) {
  if (data.length === 0) return <EmptyChart label="No departments" />;
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  let offset = 0;
  const r = 40, c = 2 * Math.PI * r;
  return (
    <div className="mt-3 flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="size-24 -rotate-90">
        {data.map((d, i) => {
          const frac = d.count / total;
          const dash = frac * c;
          const seg = <circle key={i} cx={50} cy={50} r={r} fill="none" strokeWidth={14}
            stroke={DEPT_COLORS[i % DEPT_COLORS.length]} strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset} />;
          offset += dash;
          return seg;
        })}
      </svg>
      <div className="flex-1 space-y-1">
        {data.slice(0, 5).map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="size-2.5 rounded-full" style={{ background: DEPT_COLORS[i % DEPT_COLORS.length] }} />
            <span className="flex-1 truncate text-ink-muted">{d.name}</span>
            <span className="font-medium text-ink">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyChart({ label = "No data yet" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-8" style={{ minHeight: 100 }}>
      <div className="text-center">
        <Layers className="mx-auto size-6 text-ink-faint/40" />
        <p className="mt-1 text-xs text-ink-faint">{label}</p>
      </div>
    </div>
  );
}
