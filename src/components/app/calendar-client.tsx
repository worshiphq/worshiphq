"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays, Cake, CheckCircle2, CalendarCheck2 } from "lucide-react";

type CalEvent = {
  id: string;
  title: string;
  date: string;
  type: "event" | "attendance" | "birthday";
  color: "brand" | "info" | "success" | "warning";
};

const COLOR_MAP = {
  brand: "bg-brand/15 text-brand border-brand/30",
  info: "bg-info/15 text-info border-info/30",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
};

const TYPE_ICON = {
  event: CalendarDays,
  attendance: CalendarCheck2,
  birthday: Cake,
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarClient({ events }: { events: CalEvent[] }) {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const e of events) {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }
    return map;
  }, [events]);

  const prev = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const next = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const goToday = () => {
    setMonth(today.getMonth());
    setYear(today.getFullYear());
  };

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const selectedEvents = selectedDate ? eventsByDate[selectedDate] ?? [] : [];

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={prev}>
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="min-w-[160px] text-center text-sm font-semibold">
            {MONTH_NAMES[month]} {year}
          </h2>
          <Button size="sm" variant="secondary" onClick={next}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button size="sm" variant="secondary" onClick={goToday}>Today</Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-7 border-b border-line">
          {DAY_NAMES.map((d) => (
            <div key={d} className="px-1 py-2 text-center text-[11px] font-medium text-ink-faint">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} className="min-h-[80px] border-b border-r border-line/50 bg-surface-2/30" />;

            const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayEvents = eventsByDate[dateKey] ?? [];
            const isToday = dateKey === todayStr;
            const isSelected = dateKey === selectedDate;

            return (
              <button
                key={dateKey}
                onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                className={`min-h-[80px] border-b border-r border-line/50 p-1 text-left transition hover:bg-surface-2 ${
                  isSelected ? "bg-brand/5 ring-1 ring-brand/30" : ""
                }`}
              >
                <span
                  className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday ? "bg-brand text-white" : ""
                  }`}
                >
                  {day}
                </span>
                <div className="mt-0.5 space-y-0.5">
                  {dayEvents.slice(0, 3).map((e) => (
                    <div
                      key={e.id}
                      className={`truncate rounded border px-1 py-0.5 text-[9px] font-medium leading-tight ${COLOR_MAP[e.color]}`}
                    >
                      {e.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <p className="text-[9px] text-ink-faint">+{dayEvents.length - 3} more</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {selectedDate && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </h3>
          {selectedEvents.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">No events on this day.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {selectedEvents.map((e) => {
                const Icon = TYPE_ICON[e.type];
                return (
                  <div key={e.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2">
                    <Icon className={`size-4 ${e.color === "brand" ? "text-brand" : e.color === "info" ? "text-info" : e.color === "success" ? "text-success" : "text-warning"}`} />
                    <div>
                      <p className="text-sm font-medium">{e.title}</p>
                      <p className="text-xs text-ink-muted capitalize">{e.type}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-brand" /> Events</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-info" /> Special events</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-success" /> Attendance</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-warning" /> Birthdays</span>
      </div>
    </div>
  );
}
