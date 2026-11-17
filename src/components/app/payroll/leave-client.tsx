"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, ChevronLeft, ChevronRight, Plus, CalendarDays, Settings2, ArrowRightLeft, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFeedback } from "@/components/ui/feedback";
import { decideLeave, saveLeaveType, toggleLeaveType, carryOverLeave, adjustLeave } from "@/app/actions/leave";
import { saveHoliday } from "@/app/actions/payroll";
import type { LeaveOverview } from "@/lib/data/leave";
import { LeaveRequestForm } from "./leave-request-form";
import { BusyButton } from "./busy-button";
import { fmtDay, field } from "./ui";
import { cn } from "@/lib/utils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function LeaveClient({ data, year, month, canManage, userId }: { data: LeaveOverview; year: number; month: number; canManage: boolean; userId: string }) {
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [adjust, setAdjust] = useState<{ staffId: string; name: string } | null>(null);
  const [notify, setNotify] = useState(false);
  const activeTypes = data.types.filter((t) => t.active);
  const go = (y: number, m: number) => router.push(`/app/staff?tab=leave&y=${y}&m=${m}`);
  const prev = month === 1 ? [year - 1, 12] : [year, month - 1];
  const next = month === 12 ? [year + 1, 1] : [year, month + 1];
  const mine = data.pending.filter((p) => canManage || p.reportsToUserId === userId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {canManage && <Button onClick={() => setRecording(true)}><Plus className="size-4" /> Record leave for someone</Button>}
        {canManage && <Button variant="secondary" onClick={() => setTypesOpen(true)}><Settings2 className="size-4" /> Leave types and holidays</Button>}
        {canManage && <BusyButton variant="ghost" pendingLabel="Carrying over…" confirm={`Carry unused leave from ${year} into ${year + 1}, up to each type's limit?`} run={() => carryOverLeave(year)}><ArrowRightLeft className="size-4" /> Carry over unused leave to {year + 1}</BusyButton>}
      </div>

      {/* Waiting */}
      <Card className="p-5">
        <h3 className="font-display text-lg font-semibold">Waiting for a decision {mine.length > 0 && <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">{mine.length}</span>}</h3>
        {mine.length === 0 ? <p className="mt-2 text-sm text-ink-muted">Nothing waiting.</p> : (
          <>
            <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Text them the decision (uses SMS credits, never includes your note)</label>
            <ul className="mt-3 divide-y divide-line-soft">
              {mine.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{r.name} <span className="font-normal text-ink-muted">· {r.type}{r.paid ? "" : " (unpaid)"}</span></div>
                    <div className="text-xs text-ink-muted">{fmtDay(r.startDate, { day: "numeric", month: "short" })}{r.endDate !== r.startDate ? ` to ${fmtDay(r.endDate, { day: "numeric", month: "short" })}` : ""} · {r.days} day{r.days === 1 ? "" : "s"}{r.reason ? ` · "${r.reason}"` : ""}</div>
                  </div>
                  {r.staffUserId === userId ? <span className="text-xs text-ink-faint">Your own request</span> : (
                    <div className="flex gap-2">
                      <BusyButton size="sm" pendingLabel="Approving…" run={() => decideLeave(r.id, "approved", undefined, notify)}><Check className="size-4" /> Approve</BusyButton>
                      <BusyButton size="sm" variant="secondary" pendingLabel="Declining…" run={() => decideLeave(r.id, "declined", window.prompt("A note for the record (optional)") ?? undefined, notify)}><X className="size-4" /> Decline</BusyButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* Calendar */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><CalendarDays className="size-5 text-primary" /> {MONTHS[month - 1]} {year}</h3>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => go(prev[0], prev[1])}><ChevronLeft /></Button>
            <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => go(next[0], next[1])}><ChevronRight /></Button>
          </div>
        </div>
        <LeaveCalendar year={year} month={month} items={data.month} holidays={data.holidays} />
        {activeTypes.length > 0 && <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-muted">{activeTypes.map((t) => <span key={t.id} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: t.color }} />{t.name}</span>)}</div>}
      </Card>

      {/* Balances */}
      <Card className="p-0">
        <div className="border-b border-line p-5"><h3 className="font-display text-lg font-semibold">Balances for {year}</h3><p className="text-sm text-ink-muted">Days left. Someone who started this year gets a share of the year.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-ink-faint"><tr className="border-b border-line"><th className="px-5 py-3 font-semibold">Staff</th>{activeTypes.map((t) => <th key={t.id} className="px-3 py-3 text-right font-semibold">{t.name}</th>)}{canManage && <th />}</tr></thead>
            <tbody>
              {data.balances.map((b) => (
                <tr key={b.staffId} className="border-b border-line-soft last:border-0">
                  <td className="whitespace-nowrap px-5 py-2.5 font-medium">{b.name}</td>
                  {activeTypes.map((t) => <td key={t.id} className={cn("px-3 py-2.5 text-right tabular-nums", (b.byType[t.id] ?? 0) < 0 && "text-danger")}>{t.daysPerYear > 0 ? b.byType[t.id] : "-"}</td>)}
                  {canManage && <td className="px-3 py-2.5 text-right"><button type="button" onClick={() => setAdjust({ staffId: b.staffId, name: b.name })} className="rounded p-1 text-ink-faint hover:text-ink" aria-label={`Adjust ${b.name}`}><Pencil className="size-3.5" /></button></td>}
                </tr>
              ))}
              {data.balances.length === 0 && <tr><td className="px-5 py-6 text-ink-muted" colSpan={activeTypes.length + 2}>No staff yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {recording && (
        <Modal open onClose={() => setRecording(false)} title="Record leave" description="Recorded by you, so it counts as approved.">
          <LeaveRequestForm types={activeTypes} staff={data.staff} onDone={() => setRecording(false)} />
        </Modal>
      )}
      {typesOpen && <TypesDialog types={data.types} onClose={() => setTypesOpen(false)} />}
      {adjust && <AdjustDialog who={adjust} year={year} types={activeTypes} onClose={() => setAdjust(null)} />}
    </div>
  );
}

/** A month grid at md and up; a day-by-day list on phones. Names and leave type only. */
export function LeaveCalendar({ year, month, items, holidays }: { year: number; month: number; items: LeaveOverview["month"]; holidays: { date: string; name: string }[] }) {
  const days = useMemo(() => {
    const out: { key: string; d: number; dow: number; people: LeaveOverview["month"]; holiday?: string }[] = [];
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let d = 1; d <= last; d++) {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dow = (new Date(Date.UTC(year, month - 1, d)).getUTCDay() + 6) % 7;
      out.push({ key, d, dow, people: items.filter((i) => i.startDate.slice(0, 10) <= key && i.endDate.slice(0, 10) >= key), holiday: holidays.find((h) => h.date.slice(0, 10) === key)?.name });
    }
    return out;
  }, [year, month, items, holidays]);
  const lead = days[0]?.dow ?? 0;
  const busy = days.filter((d) => d.people.length || d.holiday);
  return (
    <>
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-ink-faint">{WEEK.map((w) => <div key={w} className="py-1">{w}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
          {days.map((d) => (
            <div key={d.key} className={cn("min-h-20 rounded-lg border border-line-soft p-1.5", d.dow >= 5 && "bg-surface-2/40", d.holiday && "bg-amber-500/5")}>
              <div className="text-xs font-semibold text-ink-muted">{d.d}</div>
              {d.holiday && <div className="truncate text-[10px] text-amber-700 dark:text-amber-400">{d.holiday}</div>}
              {d.dow < 5 && d.people.slice(0, 3).map((p) => <div key={p.id} title={`${p.name}, ${p.type}`} className="mt-0.5 truncate rounded px-1 text-[10px] font-medium text-white" style={{ background: p.color }}>{p.name.split(" ")[0]}</div>)}
              {d.dow < 5 && d.people.length > 3 && <div className="text-[10px] text-ink-faint">+{d.people.length - 3} more</div>}
            </div>
          ))}
        </div>
      </div>
      <ul className="space-y-2 md:hidden">
        {busy.length === 0 && <li className="text-sm text-ink-muted">Nobody is away this month.</li>}
        {busy.map((d) => (
          <li key={d.key} className="flex gap-3 rounded-xl border border-line p-3">
            <div className="w-12 shrink-0 text-center"><div className="text-[11px] uppercase text-ink-faint">{WEEK[d.dow]}</div><div className="font-display text-lg font-bold">{d.d}</div></div>
            <div className="min-w-0 flex-1 space-y-1">
              {d.holiday && <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">{d.holiday}</div>}
              {d.dow < 5 && d.people.map((p) => <div key={p.id} className="flex items-center gap-1.5 text-sm"><span className="size-2 rounded-full" style={{ background: p.color }} />{p.name} <span className="text-xs text-ink-faint">{p.type}</span></div>)}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function TypesDialog({ types, onClose }: { types: LeaveOverview["types"]; onClose: () => void }) {
  const [edit, setEdit] = useState<LeaveOverview["types"][number] | null>(null);
  const [hDate, setHDate] = useState("");
  const [hName, setHName] = useState("");
  const router = useRouter();
  const { toast } = useFeedback();
  return (
    <Modal open onClose={onClose} title="Leave types and holidays" wide>
      <div className="space-y-5">
        <ul className="divide-y divide-line-soft">
          {types.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="size-3 rounded-full" style={{ background: t.color }} />
              <span className={cn("flex-1", !t.active && "text-ink-faint line-through")}>{t.name} <span className="text-xs text-ink-muted">{t.daysPerYear} days a year{t.paid ? "" : ", unpaid"}{t.carryOverMax ? `, carry over up to ${t.carryOverMax}` : ""}</span></span>
              <Button size="sm" variant="ghost" onClick={() => setEdit(t)}><Pencil className="size-3.5" /></Button>
              <BusyButton size="sm" variant="ghost" pendingLabel="Saving…" run={() => toggleLeaveType(t.id, !t.active)}>{t.active ? "Switch off" : "Switch on"}</BusyButton>
            </li>
          ))}
        </ul>
        <Button size="sm" variant="secondary" onClick={() => setEdit({ id: "", name: "", daysPerYear: 0, paid: true, carryOverMax: 0, color: "#0d9488", active: true })}><Plus className="size-4" /> Add a leave type</Button>
        {edit && (
          <form className="space-y-3 rounded-xl border border-line p-4" action={async (fd) => { const r = await saveLeaveType(fd); if (r.ok) { toast(r.message ?? "Saved", "success"); setEdit(null); router.refresh(); } else toast(r.error, "error"); }}>
            {edit.id && <input type="hidden" name="id" value={edit.id} />}
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2"><Label htmlFor="lt-n">Name</Label><Input id="lt-n" name="name" defaultValue={edit.name} required /></div>
              <div><Label htmlFor="lt-d">Days a year</Label><Input id="lt-d" name="daysPerYear" inputMode="decimal" defaultValue={edit.daysPerYear} /></div>
              <div><Label htmlFor="lt-c">Carry over up to</Label><Input id="lt-c" name="carryOverMax" inputMode="decimal" defaultValue={edit.carryOverMax} /></div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="paid" defaultChecked={edit.paid} /> Paid leave</label>
              <label className="flex items-center gap-2">Colour <input type="color" name="color" defaultValue={edit.color} /></label>
            </div>
            <SubmitButton pendingLabel="Saving…" overlay={false}>Save leave type</SubmitButton>
          </form>
        )}
        <div className="border-t border-line pt-4">
          <div className="mb-2 text-sm font-semibold">Public holidays</div>
          <div className="flex flex-wrap items-end gap-2">
            <Input aria-label="Date" type="date" className="w-44" value={hDate} onChange={(e) => setHDate(e.target.value)} />
            <Input aria-label="Name" className="flex-1" value={hName} onChange={(e) => setHName(e.target.value)} placeholder="e.g. Independence Day" />
            <BusyButton pendingLabel="Adding…" run={() => saveHoliday(hDate, hName)} onDone={(r) => { if (r.ok) { setHDate(""); setHName(""); } }}>Add holiday</BusyButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}


function AdjustDialog({ who, year, types, onClose }: { who: { staffId: string; name: string }; year: number; types: LeaveOverview["types"]; onClose: () => void }) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [days, setDays] = useState("");
  const [note, setNote] = useState("");
  return (
    <Modal open onClose={onClose} title={`Adjust ${who.name}'s leave`} description={`For ${year}. Use a minus to take days away.`}>
      <div className="space-y-4">
        <select aria-label="Leave type" className={field} value={typeId} onChange={(e) => setTypeId(e.target.value)}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="ad-d">Days</Label><Input id="ad-d" inputMode="decimal" value={days} onChange={(e) => setDays(e.target.value)} placeholder="e.g. 3 or -1" /></div><div><Label htmlFor="ad-n">Why</Label><Input id="ad-n" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Opening balance" /></div></div>
        <BusyButton className="w-full" pendingLabel="Saving…" run={() => adjustLeave(who.staffId, typeId, year, Number(days), note)} onDone={(r) => r.ok && onClose()}>Save adjustment</BusyButton>
      </div>
    </Modal>
  );
}
