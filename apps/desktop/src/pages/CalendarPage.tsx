import { useEffect, useState, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, Loader2, CalendarDays, Cake, CalendarCheck2,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { cn } from "../lib/utils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type CalEvent = {
  id: string;
  title: string;
  dateKey: string; // yyyy-mm-dd
  type: "event" | "attendance" | "birthday";
  time?: string | null;
};

const TYPE_STYLE: Record<CalEvent["type"], { dot: string; text: string; icon: any; label: string }> = {
  event: { dot: "bg-primary-bright", text: "text-primary-bright", icon: CalendarDays, label: "Events" },
  attendance: { dot: "bg-success", text: "text-success", icon: CalendarCheck2, label: "Attendance" },
  birthday: { dot: "bg-gold", text: "text-gold", icon: Cake, label: "Birthdays" },
};

export function CalendarPage() {
  const { session, syncVersion } = useAppStore();
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion, year]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const rangeStart = `${year - 1}-01-01`;
    const rangeEnd = `${year + 1}-12-31`;
    const [evRows, sessRows, bdayRows] = await Promise.all([
      db.rawQuery("SELECT id, title, type, starts_at FROM event WHERE church_id = ? AND starts_at >= ? AND starts_at <= ? ORDER BY starts_at ASC", [cid, rangeStart, rangeEnd]),
      db.rawQuery("SELECT id, service_name, date FROM attendance_session WHERE church_id = ? AND date >= ? AND date <= ? ORDER BY date ASC", [cid, rangeStart, rangeEnd]),
      db.rawQuery("SELECT first_name, last_name, birthday FROM person WHERE church_id = ? AND birthday IS NOT NULL", [cid]),
    ]);

    const combined: CalEvent[] = [
      ...evRows.map((e: any) => ({
        id: `ev-${e.id}`, title: e.title, dateKey: (e.starts_at || "").slice(0, 10),
        type: "event" as const, time: (e.starts_at || "").includes("T") ? (e.starts_at || "").slice(11, 16) : null,
      })),
      ...sessRows.map((s: any) => ({
        id: `att-${s.id}`, title: s.service_name, dateKey: (s.date || "").slice(0, 10), type: "attendance" as const,
      })),
      // birthdays: normalize to current viewing year (birthday stored MM-DD or full date)
      ...bdayRows.map((b: any) => {
        const bd: string = b.birthday || "";
        let mm = "", dd = "";
        if (/^\d{2}-\d{2}$/.test(bd)) { [mm, dd] = bd.split("-"); }
        else { const d = new Date(bd); if (!isNaN(d.getTime())) { mm = String(d.getMonth() + 1).padStart(2, "0"); dd = String(d.getDate()).padStart(2, "0"); } }
        if (!mm || !dd) return null;
        return { id: `bd-${b.first_name}-${b.last_name}-${mm}${dd}`, title: `${b.first_name} ${b.last_name}'s birthday`, mm, dd, type: "birthday" as const };
      }).filter(Boolean).map((b: any) => ({ id: b.id, title: b.title, dateKey: `${year}-${b.mm}-${b.dd}`, type: "birthday" as const })),
    ].filter((e) => e.dateKey);

    setEvents(combined);
    setLoading(false);
  }

  function prev() { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); setSelected(null); }
  function next() { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); setSelected(null); }
  function goToday() { const now = new Date(); setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(null); }

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const e of events) { (map[e.dateKey] ||= []).push(e); }
    return map;
  }, [events]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: { date: number | null; key: string | null }[] = [];
    for (let i = 0; i < firstDay; i++) days.push({ date: null, key: null });
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: d, key: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
    }
    return days;
  }, [year, month]);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const monthCount = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return events.filter((e) => e.dateKey.startsWith(prefix)).length;
  }, [events, year, month]);

  const selectedEvents = selected ? eventsByDate[selected] ?? [] : [];

  return (
    <PageShell title="Calendar">
      <PageHeader title="Church Calendar" description="View events, services, and birthdays at a glance." />

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
        <p className="text-xs text-ink-muted">{monthCount} item{monthCount !== 1 ? "s" : ""} this month</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="size-8 text-primary-bright whq-spin" /></div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="grid grid-cols-7 border-b border-line">
              {DAYS.map((d) => (
                <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-faint bg-surface-2/50">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map((day, i) => {
                if (day.date === null) return <div key={`e-${i}`} className="min-h-[84px] border-b border-r border-line-soft bg-surface-2/30" />;
                const dayEvents = eventsByDate[day.key!] ?? [];
                const isToday = day.key === todayKey;
                const isSelected = day.key === selected;
                return (
                  <button
                    key={day.key}
                    onClick={() => setSelected(isSelected ? null : day.key)}
                    className={cn(
                      "min-h-[84px] border-b border-r border-line-soft p-1.5 text-left transition hover:bg-surface-2",
                      isSelected && "bg-primary-soft/40 ring-1 ring-primary/30",
                      !isSelected && isToday && "bg-primary-soft/20"
                    )}
                  >
                    <span className={cn(
                      "inline-grid size-6 place-items-center rounded-full text-xs font-medium",
                      isToday ? "bg-primary-bright text-white font-bold" : "text-ink"
                    )}>{day.date}</span>
                    <div className="mt-0.5 space-y-0.5">
                      {dayEvents.slice(0, 3).map((e) => (
                        <div key={e.id} className="flex items-center gap-1 rounded px-1 py-0.5" title={e.title}>
                          <div className={cn("size-1.5 shrink-0 rounded-full", TYPE_STYLE[e.type].dot)} />
                          <span className="text-[10px] text-ink-muted truncate">{e.title}</span>
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[10px] text-primary-bright font-medium px-1">+{dayEvents.length - 3} more</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-muted">
            {(Object.keys(TYPE_STYLE) as CalEvent["type"][]).map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-full", TYPE_STYLE[t].dot)} /> {TYPE_STYLE[t].label}
              </span>
            ))}
          </div>

          {/* Selected day detail */}
          {selected && (
            <div className="card mt-4 p-4">
              <h3 className="text-sm font-bold text-ink">
                {new Date(selected + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </h3>
              {selectedEvents.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">No events on this day.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {selectedEvents.map((e) => {
                    const Icon = TYPE_STYLE[e.type].icon;
                    return (
                      <div key={e.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2">
                        <Icon className={cn("size-4", TYPE_STYLE[e.type].text)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink truncate">{e.title}</p>
                          <p className="text-xs text-ink-muted capitalize">{e.type}{e.time ? ` · ${e.time}` : ""}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
