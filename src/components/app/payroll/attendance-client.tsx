"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ScanFace, Hand, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { markStaffDay } from "@/app/actions/staff-attendance";
import { BusyButton } from "./busy-button";
import { field } from "./ui";
import { cn } from "@/lib/utils";

type Row = { staffId: string; date: string; status: string; clockIn: string | null; clockOut: string | null; source: string; note: string | null };
const CLS: Record<string, string> = {
  present: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  late: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  absent: "bg-danger/10 text-danger",
  leave: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  holiday: "bg-surface-2 text-ink-muted",
};
const hhmm = (iso: string | null) => (iso ? iso.slice(11, 16) : "");
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Staff time this week: from the check-in devices, staff clocking themselves in, or marked by hand. */
export function AttendanceClient({ monday, staff, rows, canManage }: { monday: string; staff: { id: string; name: string }[]; rows: Row[]; canManage: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ staffId: string; name: string; date: string; row?: Row } | null>(null);
  const start = new Date(`${monday}T00:00:00.000Z`);
  const dates = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10));
  const shift = (days: number) => router.push(`/app/staff?tab=attendance&week=${new Date(start.getTime() + days * 86_400_000).toISOString().slice(0, 10)}`);
  const by = new Map(rows.map((r) => [`${r.staffId}:${r.date}`, r]));
  const icon = (s: string) => (s === "device" ? <ScanFace className="size-3" /> : s === "self" ? <Smartphone className="size-3" /> : <Hand className="size-3" />);

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-line p-4">
        <div><h3 className="font-display text-lg font-semibold">Week of {start.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}</h3><p className="text-xs text-ink-muted">From check-in devices, staff clocking in from My pay, or marked here.</p></div>
        <div className="flex gap-1"><Button size="icon" variant="ghost" aria-label="Previous week" onClick={() => shift(-7)}><ChevronLeft /></Button><Button size="icon" variant="ghost" aria-label="Next week" onClick={() => shift(7)}><ChevronRight /></Button></div>
      </div>
      {staff.length === 0 ? <p className="p-6 text-sm text-ink-muted">No active staff.</p> : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-ink-faint"><tr className="border-b border-line"><th className="px-4 py-2 text-left font-semibold">Staff</th>{dates.map((d, i) => <th key={d} className={cn("px-2 py-2 text-center font-semibold", i >= 5 && "text-ink-faint/60")}>{DAYS[i]} {Number(d.slice(8))}</th>)}</tr></thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-line-soft last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 font-medium">{s.name}</td>
                    {dates.map((d) => {
                      const r = by.get(`${s.id}:${d}`);
                      return (
                        <td key={d} className="px-1 py-1.5 text-center">
                          <button type="button" disabled={!canManage} onClick={() => setEdit({ staffId: s.id, name: s.name, date: d, row: r })} className={cn("inline-flex min-h-9 w-full flex-col items-center justify-center rounded-lg px-1 text-[11px]", r ? CLS[r.status] : "text-ink-faint hover:bg-surface-2")}>
                            {r ? <><span className="inline-flex items-center gap-1 font-semibold capitalize">{icon(r.source)}{r.status}</span>{r.clockIn && <span className="tabular-nums">{hhmm(r.clockIn)}{r.clockOut ? `-${hhmm(r.clockOut)}` : ""}</span>}</> : "-"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-line-soft md:hidden">
            {staff.map((s) => (
              <li key={s.id} className="p-4">
                <div className="mb-2 font-semibold">{s.name}</div>
                <div className="grid grid-cols-7 gap-1">
                  {dates.map((d, i) => {
                    const r = by.get(`${s.id}:${d}`);
                    return <button key={d} type="button" disabled={!canManage} onClick={() => setEdit({ staffId: s.id, name: s.name, date: d, row: r })} className={cn("rounded-lg py-1.5 text-center text-[10px]", r ? CLS[r.status] : "bg-surface-2/50 text-ink-faint")}><div>{DAYS[i][0]}</div><div className="font-semibold">{r ? r.status[0].toUpperCase() : "-"}</div></button>;
                  })}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {edit && <DayDialog edit={edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function DayDialog({ edit, onClose }: { edit: { staffId: string; name: string; date: string; row?: Row }; onClose: () => void }) {
  const [status, setStatus] = useState(edit.row?.status ?? "present");
  const [cin, setIn] = useState(hhmm(edit.row?.clockIn ?? null));
  const [cout, setOut] = useState(hhmm(edit.row?.clockOut ?? null));
  const [note, setNote] = useState(edit.row?.note ?? "");
  return (
    <Modal open onClose={onClose} title={edit.name} description={new Date(`${edit.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}>
      <div className="space-y-4">
        <div><Label htmlFor="dd-s">Status</Label><select id="dd-s" className={field} value={status} onChange={(e) => setStatus(e.target.value)}>{["present", "late", "absent", "leave", "holiday"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="dd-i">In</Label><Input id="dd-i" type="time" value={cin} onChange={(e) => setIn(e.target.value)} /></div><div><Label htmlFor="dd-o">Out</Label><Input id="dd-o" type="time" value={cout} onChange={(e) => setOut(e.target.value)} /></div></div>
        <div><Label htmlFor="dd-n">Note</Label><Input id="dd-n" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <BusyButton className="w-full" pendingLabel="Saving…" run={() => markStaffDay(edit.staffId, edit.date, status, cin || null, cout || null, note)} onDone={(r) => r.ok && onClose()}>Save day</BusyButton>
      </div>
    </Modal>
  );
}
