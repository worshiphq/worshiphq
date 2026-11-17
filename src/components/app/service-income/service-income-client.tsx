"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil, Plus, Settings2, Trash2, TrendingDown, TrendingUp, Users, Search, Link2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { DownloadButton } from "@/components/ui/download-button";
import { useServerList } from "@/components/ui/use-server-list";
import { addSheetFund, deleteServiceSheet, loadServiceMonth, searchServiceSheets, setServiceSheetFunds } from "@/app/actions/service-income";
import { WEEKDAY_NAMES, shiftYmd, weekdayOf, type ServiceCard, type ServiceMonthData, type ServiceWeekData } from "@/lib/service-income/types";
import { cn } from "@/lib/utils";
import { BusyButton, Empty, dayMonth, dayMonthYear, ghs, ghs0, inputCls, useLevyAction } from "@/components/app/levies/shared";
import { ServiceSheetDialog } from "./service-sheet-dialog";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function ServiceCardView({ s, access, onEdit }: { s: ServiceCard; access: ServiceWeekData["access"]; onEdit: () => void }) {
  const { pending, run } = useLevyAction();
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">{WEEKDAY_NAMES[weekdayOf(s.dateYmd)]}, {dayMonth(s.dateYmd)}</div>
          <h3 className="font-display text-[1rem] font-semibold">{s.serviceName}</h3>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-2xl font-bold tabular-nums">{ghs(s.total)}</div>
          {s.perPerson !== null && <div className="text-xs text-ink-muted">{ghs(s.perPerson)} per person</div>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {s.byFund.map((f) => <span key={f.name} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs"><span className="font-medium">{f.name}</span> <span className="tabular-nums text-ink-muted">{ghs0(f.total)}</span></span>)}
        {s.byFund.length === 0 && <span className="text-xs text-ink-faint">Nothing counted yet.</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="flex items-center gap-1"><Users className="size-3.5" />{s.attendance ? `${s.attendance} people${s.attendanceFrom === "session" ? " (from attendance)" : ""}` : "No headcount"}</span>
        {s.attendanceFrom === "session" && <span className="flex items-center gap-1 text-primary"><Link2 className="size-3.5" /> Linked to attendance</span>}
        {s.countedBy && <span>Counted by {s.countedBy}</span>}
        {s.note && <span>{s.note}</span>}
      </div>
      {access.manage && (
        <div className="mt-3 flex gap-2 border-t border-line-soft pt-3">
          <button type="button" onClick={onEdit} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-surface-2"><Pencil className="size-4" /> Edit</button>
          {access.del && (
            <BusyButton size="sm" variant="ghost" className="ml-auto text-ink-muted" busy={pending} busyLabel="Removing..."
              onClick={() => { if (window.confirm("Remove this service record? The money stays in Giving. Only this service record is removed.")) run(() => deleteServiceSheet(s.id), "Service record removed. The money stays in Giving."); }}>
              <Trash2 /> Remove
            </BusyButton>
          )}
        </div>
      )}
    </Card>
  );
}

function FundsSheet({ open, onClose, week }: { open: boolean; onClose: () => void; week: ServiceWeekData }) {
  const flagged = week.funds.filter((f) => f.inServiceSheet).map((f) => f.id);
  const [ids, setIds] = useState<string[]>(flagged.length ? flagged : week.funds.filter((f) => f.kind !== "other").map((f) => f.id));
  const [name, setName] = useState("");
  const { pending, run } = useLevyAction();
  const [adding, startAdd] = useTransition();
  return (
    <Modal open={open} onClose={onClose} title="Kinds of income on the sheet" description="These appear as rows when you add a service record. Others can still be added on the sheet.">
      <div className="space-y-1">
        {week.funds.map((f) => (
          <label key={f.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
            <input type="checkbox" checked={ids.includes(f.id)} onChange={() => setIds((p) => (p.includes(f.id) ? p.filter((x) => x !== f.id) : [...p, f.id]))} className="size-4 accent-[var(--color-primary)]" />
            {f.name}
          </label>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a kind, e.g. Thanksgiving" className={`${inputCls} h-10`} />
        <button type="button" disabled={!name.trim() || adding} onClick={() => startAdd(async () => { const r = await addSheetFund(name); if (r.ok) { setIds((p) => [...p, r.id]); setName(""); } })} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-surface-2 disabled:opacity-50">
          {adding ? <><Spinner size="sm" /> Adding...</> : <><Plus className="size-4" /> Add</>}
        </button>
      </div>
      <div className="mt-5 flex justify-end">
        <BusyButton busy={pending} busyLabel="Saving..." onClick={() => run(() => setServiceSheetFunds(ids), "Service sheet updated.", onClose)}>Save</BusyButton>
      </div>
    </Modal>
  );
}

function MonthView({ initialYear, initialMonth }: { initialYear: number; initialMonth: number }) {
  const [ym, setYm] = useState({ y: initialYear, m: initialMonth });
  const k = `${ym.y}-${ym.m}`;
  const [got, setGot] = useState<{ k: string; d: ServiceMonthData } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = got?.k === k ? got.d : null;
  useEffect(() => {
    let live = true;
    loadServiceMonth(ym.y, ym.m).then((d) => { if (live) { setGot({ k: `${ym.y}-${ym.m}`, d }); setError(null); } }).catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [ym]);
  const step = (d: number) => setYm((p) => { const i = p.y * 12 + p.m + d; return { y: Math.floor(i / 12), m: i % 12 }; });
  const max = Math.max(1, ...(data?.weeks.map((w) => w.total) ?? [1]));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => step(-1)} className="grid size-9 place-items-center rounded-lg border border-line hover:bg-surface-2" aria-label="Previous month"><ChevronLeft className="size-4" /></button>
        <span className="min-w-36 text-center text-sm font-semibold">{MONTHS[ym.m]} {ym.y}</span>
        <button type="button" onClick={() => step(1)} className="grid size-9 place-items-center rounded-lg border border-line hover:bg-surface-2" aria-label="Next month"><ChevronRight className="size-4" /></button>
        {!data && !error && <Spinner size="sm" />}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {data && (data.services === 0 ? <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-ink-muted">No service records in {MONTHS[ym.m]}.</p> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="card-surface p-4"><div className="text-xs text-ink-muted">Services</div><div className="font-display text-xl font-bold">{data.services}</div></div>
            <div className="card-surface p-4"><div className="text-xs text-ink-muted">Total</div><div className="font-display text-xl font-bold tabular-nums">{ghs(data.total)}</div></div>
            <div className="card-surface p-4"><div className="text-xs text-ink-muted">Per person</div><div className="font-display text-xl font-bold tabular-nums">{data.attendance ? ghs(data.total / data.attendance) : "-"}</div></div>
          </div>
          <Card className="p-5">
            <div className="flex h-36 items-end gap-3">
              {data.weeks.map((w) => (
                <div key={w.key} className="flex h-full flex-1 flex-col justify-end" title={`${w.label}: ${ghs(w.total)}`}>
                  <div className="mx-auto w-full max-w-12 rounded-t bg-primary/80" style={{ height: `${Math.max(w.total ? 4 : 0, (w.total / max) * 100)}%` }} />
                  <div className="mt-1.5 truncate text-center text-[10px] text-ink-faint">{w.label}</div>
                </div>
              ))}
            </div>
          </Card>
          {/* Grid on wide screens, cards on phones */}
          <Card className="hidden overflow-x-auto p-0 sm:block">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="p-3 font-medium">Kind of income</th>{data.weeks.map((w) => <th key={w.key} className="p-3 text-right font-medium">{w.label}</th>)}<th className="p-3 text-right font-medium">Month</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.name} className="border-b border-line-soft"><td className="p-3 font-medium">{r.name}</td>{r.cells.map((c, i) => <td key={i} className="p-3 text-right tabular-nums">{c ? ghs(c) : <span className="text-ink-faint">-</span>}</td>)}<td className="p-3 text-right font-semibold tabular-nums">{ghs(r.total)}</td></tr>
                ))}
                <tr className="bg-surface-2/60 font-semibold"><td className="p-3">Total</td>{data.weeks.map((w) => <td key={w.key} className="p-3 text-right tabular-nums">{ghs(w.total)}</td>)}<td className="p-3 text-right tabular-nums">{ghs(data.total)}</td></tr>
                <tr className="text-xs text-ink-muted"><td className="p-3">Attendance</td>{data.weeks.map((w) => <td key={w.key} className="p-3 text-right">{w.attendance || "-"}</td>)}<td className="p-3 text-right">{data.attendance || "-"}</td></tr>
              </tbody>
            </table>
          </Card>
          <div className="space-y-2 sm:hidden">
            {data.weeks.map((w, i) => (
              <Card key={w.key} className="p-4">
                <div className="flex justify-between text-sm"><span className="font-semibold">{w.label}</span><span className="font-semibold tabular-nums">{ghs(w.total)}</span></div>
                <ul className="mt-2 space-y-0.5 text-xs text-ink-muted">{data.rows.filter((r) => r.cells[i]).map((r) => <li key={r.name} className="flex justify-between"><span>{r.name}</span><span className="tabular-nums">{ghs(r.cells[i])}</span></li>)}</ul>
              </Card>
            ))}
          </div>
        </>
      ))}
      <History year={ym.y} />
    </div>
  );
}

/** Loads the first page, then hands over to the searchable list. */
function History({ year }: { year: number }) {
  const [got, setGot] = useState<{ year: number; first: { rows: ServiceCard[]; total: number; page: number } } | null>(null);
  const first = got?.year === year ? got.first : null;
  useEffect(() => {
    let live = true;
    searchServiceSheets("", { year }, 1).then((r) => { if (live) setGot({ year, first: r }); }).catch(() => { if (live) setGot({ year, first: { rows: [], total: 0, page: 1 } }); });
    return () => { live = false; };
  }, [year]);
  if (!first) return <p className="flex items-center gap-2 text-sm text-ink-muted"><Spinner size="sm" /> Loading service records...</p>;
  return <HistoryList key={year} year={year} initial={first} />;
}

function HistoryList({ year, initial }: { year: number; initial: { rows: ServiceCard[]; total: number; page: number } }) {
  const [q, setQ] = useState("");
  const list = useServerList<ServiceCard, { year?: number }>({ initial, query: q, filters: { year }, fetchPage: searchServiceSheets, pageSize: 20 });
  return (
    <Card className="p-5">
      <h3 className="font-display text-[1rem] font-semibold">All service records in {year}</h3>
      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by service or who counted" className={`${inputCls} pl-9`} />
        {list.spinner}
      </div>
      <ul className="mt-3 divide-y divide-line-soft text-sm">
        {list.rows.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-2.5">
            <span className="w-24 shrink-0 text-ink-muted">{dayMonthYear(s.dateYmd)}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{s.serviceName}</span>
            <span className="hidden text-xs text-ink-faint sm:inline">{s.attendance ? `${s.attendance} people` : ""}</span>
            <span className="w-28 text-right font-semibold tabular-nums">{ghs(s.total)}</span>
          </li>
        ))}
        {list.rows.length === 0 && !list.searching && <li className="py-3 text-ink-muted">{q ? "Nothing matches." : "No service records yet."}</li>}
      </ul>
      {list.pager}
    </Card>
  );
}

export function ServiceIncomeClient({ week }: { week: ServiceWeekData }) {
  const router = useRouter();
  const pathname = usePathname();
  const [nav, startNav] = useTransition();
  const [view, setView] = useState<"week" | "month">("week");
  const [sheet, setSheet] = useState<{ key: number; existing: ServiceCard | null; date: string } | null>(null);
  const [funds, setFunds] = useState(false);
  const go = (ymd: string) => startNav(() => router.replace(`${pathname}?w=${ymd}`, { scroll: false }));
  const change = week.lastWeekTotal > 0 ? Math.round(((week.weekTotal - week.lastWeekTotal) / week.lastWeekTotal) * 100) : null;
  const isThisWeek = week.todayYmd >= week.weekStartYmd && week.todayYmd <= week.weekEndYmd;
  const defaultDate = isThisWeek ? week.todayYmd : week.weekStartYmd;
  const untaggedByDay = week.untagged.reduce<Record<string, typeof week.untagged>>((m, g) => ({ ...m, [g.dateYmd]: [...(m[g.dateYmd] ?? []), g] }), {});

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Service income</h1>
          <p className="mt-1.5 max-w-xl text-sm text-ink-muted">What each service brought in, by kind of income, next to how many came. Saved as ordinary giving, so nothing is entered twice.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex gap-1 rounded-xl bg-surface-2 p-1">
            {(["week", "month"] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", view === v ? "bg-surface text-ink shadow-sm" : "text-ink-muted")}>{v === "week" ? "Week" : "Month"}</button>)}
          </div>
          <DownloadButton url="/api/export/service-income" variant="secondary">Download</DownloadButton>
          {week.access.manage && <button type="button" onClick={() => setFunds(true)} className="grid size-10 place-items-center rounded-xl border border-line hover:bg-surface-2" aria-label="Kinds of income on the sheet"><Settings2 className="size-4" /></button>}
          {week.access.manage && <button type="button" onClick={() => setSheet({ key: Date.now(), existing: null, date: defaultDate })} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"><Plus className="size-4" /> Add service record</button>}
        </div>
      </div>

      {view === "month" ? (
        <MonthView initialYear={Number(week.weekStartYmd.slice(0, 4))} initialMonth={Number(week.weekStartYmd.slice(5, 7)) - 1} />
      ) : (
        <div className={cn("space-y-4 transition-opacity", nav && "opacity-60")}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
              <button type="button" onClick={() => go(shiftYmd(week.weekStartYmd, -7))} className="grid size-8 place-items-center rounded-lg hover:bg-surface-2" aria-label="Previous week"><ChevronLeft className="size-4" /></button>
              <span className="flex min-w-44 items-center justify-center gap-1.5 text-sm font-semibold">{nav && <Spinner size="sm" />}{dayMonth(week.weekStartYmd)} to {dayMonthYear(week.weekEndYmd)}</span>
              <button type="button" onClick={() => go(shiftYmd(week.weekStartYmd, 7))} disabled={isThisWeek} className="grid size-8 place-items-center rounded-lg hover:bg-surface-2 disabled:opacity-40" aria-label="Next week"><ChevronRight className="size-4" /></button>
            </div>
            {!isThisWeek && <button type="button" onClick={() => go(week.todayYmd)} className="text-sm font-medium text-primary-bright hover:underline">This week</button>}
            <div className="ml-auto text-right">
              <div className="font-display text-2xl font-bold tabular-nums">{ghs(week.weekTotal)}</div>
              {change !== null && <div className={cn("flex items-center justify-end gap-1 text-xs font-semibold", change >= 0 ? "text-success" : "text-danger")}>{change >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />} {change >= 0 ? "Up" : "Down"} {Math.abs(change)}% on last week</div>}
            </div>
          </div>

          {week.services.length === 0 ? (
            <Empty title="No services recorded this week" text="Add each service's count: tithes, offering and anything else, split by cash, Mobile Money and bank. It goes into Giving as well.">
              {week.access.manage && <button type="button" onClick={() => setSheet({ key: Date.now(), existing: null, date: defaultDate })} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white"><Plus className="size-4" /> Add service record</button>}
            </Empty>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {week.services.map((s) => <ServiceCardView key={s.id} s={s} access={week.access} onEdit={() => setSheet({ key: Date.now(), existing: s, date: s.dateYmd })} />)}
            </div>
          )}

          {week.untagged.length > 0 && (
            <Card className="p-5">
              <h3 className="font-display text-[1rem] font-semibold">Recorded in Giving but not tied to a service</h3>
              <p className="text-xs text-ink-muted">Open a service on that day and tick these under &quot;Already recorded in Giving that day&quot; to count them there.</p>
              <div className="mt-3 space-y-3">
                {Object.entries(untaggedByDay).map(([day, gifts]) => (
                  <div key={day}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{WEEKDAY_NAMES[weekdayOf(day)]}, {dayMonth(day)}</span>
                      <span className="flex items-center gap-3"><span className="tabular-nums text-ink-muted">{gifts.length} gift{gifts.length === 1 ? "" : "s"}, {ghs(gifts.reduce((t, g) => t + g.amount, 0))}</span>
                        {week.access.manage && <button type="button" onClick={() => { const existing = week.services.find((s) => s.dateYmd === day) ?? null; setSheet({ key: Date.now(), existing, date: day }); }} className="text-xs font-semibold text-primary-bright hover:underline">Add to a service</button>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {sheet && <ServiceSheetDialog key={sheet.key} open onClose={() => setSheet(null)} week={week} existing={sheet.existing} defaultDate={sheet.date} />}
      {funds && <FundsSheet open onClose={() => setFunds(false)} week={week} />}
    </div>
  );
}
