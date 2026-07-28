"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { OnFormComplete } from "@/components/ui/form-effects";
import { ChevronLeft, ChevronRight, CalendarDays, Cake, CalendarCheck2, Plus, X, Clock, MapPin } from "lucide-react";
import { createEvent, deleteEvent } from "@/app/actions/events";

type CalEvent = {
  id: string;
  title: string;
  date: string;
  endDate?: string | null;
  dates?: string[];
  type: "event" | "attendance" | "birthday";
  color: "brand" | "info" | "success" | "warning";
};

const COLOR_MAP = {
  brand: "bg-brand/15 text-brand border-brand/30",
  info: "bg-info/15 text-info border-info/30",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
};
const DOT = { brand: "bg-brand", info: "bg-info", success: "bg-success", warning: "bg-warning" };
const TYPE_ICON = { event: CalendarDays, attendance: CalendarCheck2, birthday: Cake };
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const inputCls = "h-10 w-full rounded-xl border border-line bg-base px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none";

export function CalendarClient({ events, canWrite }: { events: CalEvent[]; canWrite: boolean }) {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = keyOf(today);

  // Expand every event onto each day it occupies (explicit dates, or a
  // startsAt..endsAt range, or the single start day).
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    const push = (k: string, e: CalEvent) => { (map[k] ??= []).push(e); };
    for (const e of events) {
      const explicit = (e.dates ?? []).length ? e.dates! : null;
      if (explicit) {
        for (const iso of explicit) push(keyOf(new Date(iso)), e);
        // also the start day if not already in the list
        push(keyOf(new Date(e.date)), e);
      } else if (e.endDate) {
        const s = new Date(e.date); s.setHours(0, 0, 0, 0);
        const end = new Date(e.endDate); end.setHours(0, 0, 0, 0);
        for (let d = new Date(s); d <= end; d.setDate(d.getDate() + 1)) push(keyOf(d), e);
      } else {
        push(keyOf(new Date(e.date)), e);
      }
    }
    // de-dupe per day
    for (const k of Object.keys(map)) {
      const seen = new Set<string>();
      map[k] = map[k].filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
    }
    return map;
  }, [events]);

  const prev = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };
  const goToday = () => { setMonth(today.getMonth()); setYear(today.getFullYear()); };

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const selectedEvents = selectedDate ? eventsByDate[selectedDate] ?? [] : [];
  const prettyDay = (k: string) => new Date(k + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={prev}><ChevronLeft className="size-4" /></Button>
          <h2 className="min-w-[160px] text-center text-sm font-semibold">{MONTH_NAMES[month]} {year}</h2>
          <Button size="sm" variant="secondary" onClick={next}><ChevronRight className="size-4" /></Button>
          <Button size="sm" variant="ghost" onClick={goToday}>Today</Button>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => { setAdding(selectedDate ?? todayStr); setSelectedDate(selectedDate ?? todayStr); }}>
            <Plus className="size-4" /> Add event
          </Button>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-7 border-b border-line">
          {DAY_NAMES.map((d) => (
            <div key={d} className="px-1 py-2 text-center text-[11px] font-medium text-ink-faint">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} className="min-h-[84px] border-b border-r border-line/50 bg-surface-2/30" />;
            const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayEvents = eventsByDate[dateKey] ?? [];
            const isToday = dateKey === todayStr;
            const isSelected = dateKey === selectedDate;
            return (
              <button
                key={dateKey}
                onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                onDoubleClick={() => canWrite && (setSelectedDate(dateKey), setAdding(dateKey))}
                title={canWrite ? "Click to view · double-click to add an event" : undefined}
                className={`group relative min-h-[84px] border-b border-r border-line/50 p-1 text-left transition hover:bg-surface-2 ${isSelected ? "bg-brand/5 ring-1 ring-inset ring-brand/30" : ""}`}
              >
                <span className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-medium ${isToday ? "bg-brand text-white" : ""}`}>{day}</span>
                {canWrite && (
                  <span className="absolute right-1 top-1 hidden size-5 place-items-center rounded-md text-ink-faint hover:bg-brand/10 hover:text-brand group-hover:grid"
                    onClick={(ev) => { ev.stopPropagation(); setSelectedDate(dateKey); setAdding(dateKey); }}>
                    <Plus className="size-3.5" />
                  </span>
                )}
                <div className="mt-0.5 space-y-0.5">
                  {dayEvents.slice(0, 3).map((e) => (
                    <div key={e.id} className={`truncate rounded border px-1 py-0.5 text-[9px] font-medium leading-tight ${COLOR_MAP[e.color]}`}>{e.title}</div>
                  ))}
                  {dayEvents.length > 3 && <p className="text-[9px] text-ink-faint">+{dayEvents.length - 3} more</p>}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Selected day panel */}
      {selectedDate && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{prettyDay(selectedDate)}</h3>
            {canWrite && adding !== selectedDate && (
              <Button size="sm" variant="secondary" onClick={() => setAdding(selectedDate)}><Plus className="size-4" /> Add</Button>
            )}
          </div>

          {/* Inline add-event form */}
          {adding === selectedDate && canWrite && (
            <form action={createEvent} className="mt-3 grid gap-3 rounded-xl border border-line bg-surface-2/40 p-3 sm:grid-cols-2">
              <OnFormComplete onComplete={() => { setAdding(null); router.refresh(); }} />
              <input type="hidden" name="date" value={selectedDate} />
              <div className="sm:col-span-2"><Label>Event title</Label><Input name="title" placeholder="e.g. Youth Conference" required /></div>
              <div>
                <Label>Type</Label>
                <select name="type" defaultValue="Service" className={inputCls}>
                  {["Service","Conference","Program","Meeting","Outreach","Rehearsal","Other"].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><Label>Start time</Label><Input name="time" type="time" defaultValue="09:00" /></div>
              <div><Label>End date (multi-day, optional)</Label><Input name="endDate" type="date" min={selectedDate} /></div>
              <div><Label>Location (optional)</Label><Input name="location" placeholder="Main auditorium" /></div>
              <div className="sm:col-span-2">
                <Label>Extra days (optional, non-consecutive)</Label>
                <Input name="extraDates" placeholder="2026-08-05, 2026-08-08" />
                <p className="mt-1 text-[11px] text-ink-faint">Comma-separated YYYY-MM-DD for days like Wed/Thu/Fri + Sun.</p>
              </div>
              <div className="sm:col-span-2"><Label>Notes (optional)</Label><Input name="notes" placeholder="Anything worth noting" /></div>
              <div className="flex gap-2 sm:col-span-2">
                <SubmitButton pendingLabel="Adding…" successMessage="Event added">Add to calendar</SubmitButton>
                <Button type="button" variant="ghost" onClick={() => setAdding(null)}>Cancel</Button>
              </div>
            </form>
          )}

          {selectedEvents.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Nothing on this day{canWrite ? " yet — add something above." : "."}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {selectedEvents.map((e) => {
                const Icon = TYPE_ICON[e.type];
                const span = e.endDate ? ` → ${new Date(e.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "";
                return (
                  <div key={e.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2">
                    <Icon className={`size-4 ${e.color === "brand" ? "text-brand" : e.color === "info" ? "text-info" : e.color === "success" ? "text-success" : "text-warning"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.title}{span}</p>
                      <p className="flex items-center gap-2 text-xs text-ink-muted capitalize">
                        {e.type}
                        <span className="flex items-center gap-0.5"><Clock className="size-3" />{new Date(e.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                      </p>
                    </div>
                    {canWrite && e.type === "event" && (
                      <button
                        onClick={() => { if (confirm(`Delete "${e.title}"?`)) start(async () => { await deleteEvent(e.id); router.refresh(); }); }}
                        disabled={pending}
                        className="rounded-md p-1 text-ink-faint hover:text-danger disabled:opacity-50"
                      ><X className="size-4" /></button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${DOT.brand}`} /> Services</span>
        <span className="flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${DOT.info}`} /> Events</span>
        <span className="flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${DOT.success}`} /> Attendance</span>
        <span className="flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${DOT.warning}`} /> Birthdays</span>
      </div>
    </div>
  );
}
