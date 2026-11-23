"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const daysIn = (month: number, year: number) => new Date(year || 2000, month, 0).getDate(); // 2000 is a leap year, so 29 Feb is allowed until a year says otherwise

function split(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? "");
  return m ? { y: m[1], m: String(Number(m[2])), d: String(Number(m[3])) } : { y: "", m: "", d: "" };
}

/**
 * A date picked as three simple boxes: Day, Month and Year, each from a dropdown
 * (on a computer, typing "1985" on the Year box jumps straight to it).
 * Easier than a calendar for birthdays and other dates far in the past, where the calendar makes people
 * page back year by year. Submits one hidden `name` value as YYYY-MM-DD (empty until all three are filled),
 * so the server sees exactly what a normal date box would send.
 */
export function DateParts({
  name, value, onChange, required, className, maxYear, minYear = 1900, id,
}: {
  name: string;
  value?: string;
  onChange?: (v: string) => void;
  required?: boolean;
  className?: string;
  /** Latest year allowed (defaults to this year). */
  maxYear?: number;
  minYear?: number;
  id?: string;
}) {
  const init = split(value ?? "");
  const [d, setD] = useState(init.d);
  const [m, setM] = useState(init.m);
  const [y, setY] = useState(init.y);
  const yearRef = useRef<HTMLSelectElement>(null);
  const top = maxYear ?? new Date().getFullYear();

  // Follow outside changes (e.g. the form is filled for editing): adjust during render, React's
  // recommended way to reset state from a prop, rather than in an effect.
  const [seen, setSeen] = useState(value ?? "");
  if ((value ?? "") !== seen) {
    setSeen(value ?? "");
    const mine = d && m && y.length === 4 ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : "";
    if ((value ?? "") !== mine) { const p = split(value ?? ""); setD(p.d); setM(p.m); setY(p.y); }
  }

  const yearNum = y.length === 4 ? Number(y) : 0;
  const maxDay = m ? daysIn(Number(m), yearNum) : 31;
  // A day that no longer fits the month (31, then February) is treated as not chosen.
  const day = d && Number(d) <= maxDay ? d : "";
  const complete = day && m && y.length === 4;
  const full = complete ? `${y}-${m.padStart(2, "0")}-${day.padStart(2, "0")}` : "";
  const started = !!(d || m || y);

  // Tell the browser's own form check what is missing, so Save/Next stops on the right box.
  useEffect(() => {
    const el = yearRef.current;
    if (!el) return;
    if (started && !complete) el.setCustomValidity("Please fill in the day, month and year.");
    else el.setCustomValidity("");
  }, [started, complete]);

  useEffect(() => { onChange?.(full); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [full]);

  const box = "h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-2.5 text-sm text-ink focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";

  return (
    <div className={cn("grid grid-cols-[minmax(4.2rem,0.9fr)_minmax(0,1.5fr)_minmax(5rem,1fr)] gap-2", className)}>
      <input type="hidden" name={name} value={full} />
      <select id={id} aria-label="Day" value={day} onChange={(e) => setD(e.target.value)} required={required} className={box}>
        <option value="">Day</option>
        {Array.from({ length: maxDay }, (_, i) => String(i + 1)).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <select aria-label="Month" value={m} onChange={(e) => setM(e.target.value)} required={required} className={box}>
        <option value="">Month</option>
        {MONTHS.map((label, i) => <option key={label} value={String(i + 1)}>{label}</option>)}
      </select>
      <select ref={yearRef} aria-label="Year" value={y} onChange={(e) => setY(e.target.value)} required={required} className={box}>
        <option value="">Year</option>
        {/* An old saved year outside the list is kept so editing does not lose it. */}
        {y && (Number(y) > top || Number(y) < minYear) && <option value={y}>{y}</option>}
        {Array.from({ length: top - minYear + 1 }, (_, i) => String(top - i)).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}
