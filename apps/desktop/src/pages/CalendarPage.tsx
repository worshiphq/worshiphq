import { useEffect, useState, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, Loader2, Calendar as CalIcon,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { cn } from "../lib/utils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TYPE_COLORS: Record<string, string> = {
  service: "bg-primary-bright",
  meeting: "bg-info",
  conference: "bg-gold",
  outreach: "bg-success",
  social: "bg-pink-500",
  training: "bg-purple-500",
};

export function CalendarPage() {
  const { session, syncVersion } = useAppStore();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery("SELECT * FROM event WHERE church_id = ? ORDER BY starts_at ASC", [session!.churchId]);
    setEvents(rows);
    setLoading(false);
  }

  function prev() {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  }
  function next() {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  }
  function goToday() { const now = new Date(); setYear(now.getFullYear()); setMonth(now.getMonth()); }

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: { date: number; isCurrentMonth: boolean; events: any[] }[] = [];

    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ date: prevMonthDays - i, isCurrentMonth: false, events: [] });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayEvents = events.filter((e) => {
        const eDate = e.starts_at?.slice(0, 10);
        return eDate === dateStr;
      });
      days.push({ date: d, isCurrentMonth: true, events: dayEvents });
    }

    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: i, isCurrentMonth: false, events: [] });
    }

    return days;
  }, [year, month, events]);

  const today = new Date();
  const isToday = (d: number) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const monthEvents = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return events.filter((e) => e.starts_at?.startsWith(prefix));
  }, [events, year, month]);

  return (
    <PageShell title="Calendar">
      <PageHeader title="Church Calendar" description="View events by month." />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prev} className="grid size-8 place-items-center rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors">
            <ChevronLeft className="size-4 text-ink" />
          </button>
          <h2 className="text-lg font-bold text-ink min-w-[180px] text-center">{MONTHS[month]} {year}</h2>
          <button onClick={next} className="grid size-8 place-items-center rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors">
            <ChevronRight className="size-4 text-ink" />
          </button>
          <button onClick={goToday} className="btn-ghost btn-sm text-xs ml-2">Today</button>
        </div>
        <p className="text-xs text-ink-muted">{monthEvents.length} event{monthEvents.length !== 1 ? "s" : ""} this month</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="size-8 text-primary-bright whq-spin" /></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line">
            {DAYS.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-faint bg-surface-2/50">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => (
              <div key={i} className={cn(
                "min-h-[80px] border-b border-r border-line-soft p-1.5",
                !day.isCurrentMonth && "bg-surface-2/30",
                day.isCurrentMonth && isToday(day.date) && "bg-primary-soft/30"
              )}>
                <span className={cn(
                  "inline-grid size-6 place-items-center rounded-full text-xs font-medium",
                  !day.isCurrentMonth && "text-ink-faint/50",
                  day.isCurrentMonth && !isToday(day.date) && "text-ink",
                  day.isCurrentMonth && isToday(day.date) && "bg-primary-bright text-white font-bold"
                )}>{day.date}</span>
                <div className="mt-0.5 space-y-0.5">
                  {day.events.slice(0, 3).map((e) => (
                    <div key={e.id} className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-surface-3/50" title={e.title}>
                      <div className={cn("size-1.5 shrink-0 rounded-full", TYPE_COLORS[e.type?.toLowerCase()] || "bg-ink-faint")} />
                      <span className="text-[10px] text-ink-muted truncate">{e.title}</span>
                    </div>
                  ))}
                  {day.events.length > 3 && (
                    <span className="text-[10px] text-primary-bright font-medium px-1">+{day.events.length - 3} more</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {monthEvents.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-bold text-ink uppercase tracking-wider">Events This Month</h3>
          <div className="space-y-1.5">
            {monthEvents.map((e) => {
              const d = new Date(e.starts_at);
              return (
                <div key={e.id} className="card p-3 flex items-center gap-3">
                  <div className={cn("size-2 shrink-0 rounded-full", TYPE_COLORS[e.type?.toLowerCase()] || "bg-ink-faint")} />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm text-ink">{e.title}</span>
                    {e.type && <span className="ml-2 text-[10px] text-ink-faint uppercase">{e.type}</span>}
                  </div>
                  <span className="text-xs text-ink-faint shrink-0">
                    {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {e.starts_at?.includes("T") && ` · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PageShell>
  );
}
