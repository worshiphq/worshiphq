"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, HandCoins, Link2, Pencil, Plus, Search, Trash2, TrendingDown, TrendingUp, Unlink, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { DownloadButton } from "@/components/ui/download-button";
import { useServerList } from "@/components/ui/use-server-list";
import { CollectionForm } from "@/components/app/collection-form";
import { useServicePicker } from "@/components/app/service-picker";
import { deleteServiceSheet, linkGiftsToService, loadServiceMonth, saveServiceHeader, searchServiceSheets, untagGiftFromService } from "@/app/actions/service-income";
import { GIFT_METHOD_LABEL, WEEKDAY_NAMES, shiftYmd, weekdayOf, type ServiceCard, type ServiceMonthData, type ServiceWeekData, type UntaggedGift } from "@/lib/service-income/types";
import { cn } from "@/lib/utils";
import { BusyButton, Empty, dayMonth, dayMonthYear, ghs, ghs0, inputCls, labelCls, useLevyAction } from "@/components/app/levies/shared";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const methodLabel = (m: string) => GIFT_METHOD_LABEL[m] ?? m;

type Recording = { key: number; date: string; service: string | null };

function ServiceCardView({ s, access, onRecord, onEdit }: { s: ServiceCard; access: ServiceWeekData["access"]; onRecord: () => void; onEdit: () => void }) {
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
      <div className="mt-3 space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {s.byFund.map((f) => <span key={f.name} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs"><span className="font-medium">{f.name}</span> <span className="tabular-nums text-ink-muted">{ghs0(f.total)}</span></span>)}
          {s.byFund.length === 0 && <span className="text-xs text-ink-faint">No giving linked yet.</span>}
        </div>
        {s.byMethod.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            {s.byMethod.map((m) => <span key={m.method}>{methodLabel(m.method)} <span className="tabular-nums">{ghs0(m.total)}</span></span>)}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="flex items-center gap-1"><Users className="size-3.5" />{s.attendance ? `${s.attendance} people${s.attendanceFrom === "session" ? " (from attendance)" : ""}` : "No headcount"}</span>
        {s.countedBy && <span>Counted by {s.countedBy}</span>}
        {s.note && <span>{s.note}</span>}
      </div>
      {(access.manage || access.recordGiving) && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line-soft pt-3">
          {access.recordGiving && <button type="button" onClick={onRecord} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-surface-2"><Plus className="size-4" /> Add giving</button>}
          {access.manage && <button type="button" onClick={onEdit} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-surface-2"><Pencil className="size-4" /> Headcount and notes</button>}
          {access.del && (
            <BusyButton size="sm" variant="ghost" className="ml-auto text-ink-muted" busy={pending} busyLabel="Removing..."
              onClick={() => { if (window.confirm("Remove this service record? The money stays in Giving, as not linked to a service.")) run(() => deleteServiceSheet(s.id), "Service record removed. The money stays in Giving."); }}>
              <Trash2 /> Remove
            </BusyButton>
          )}
        </div>
      )}
    </Card>
  );
}

/** Headcount, who counted and a note. The money itself is changed in Giving; a gift can be taken out of the service here. */
function HeaderDialog({ s, onClose }: { s: ServiceCard; onClose: () => void }) {
  const { pending, run } = useLevyAction();
  const [headcount, setHeadcount] = useState(s.headcount ? String(s.headcount) : "");
  const [countedBy, setCountedBy] = useState(s.countedBy ?? "");
  const [note, setNote] = useState(s.note ?? "");
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const unlink = useLevyAction();
  return (
    <Modal open onClose={onClose} title={s.serviceName} description={`${WEEKDAY_NAMES[weekdayOf(s.dateYmd)]}, ${dayMonthYear(s.dateYmd)}. Amounts are recorded and changed in Giving.`}>
      <div className="space-y-4">
        {s.attendanceFrom === "session" ? (
          <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm"><Users className="size-4 text-primary" /> From attendance: <b>{s.attendance} people</b></p>
        ) : (
          <div><label className={labelCls} htmlFor="sh-count">How many came?</label><input id="sh-count" type="number" min="0" value={headcount} onChange={(e) => setHeadcount(e.target.value)} placeholder="Headcount" className={inputCls} /></div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelCls} htmlFor="sh-by">Counted by</label><input id="sh-by" value={countedBy} onChange={(e) => setCountedBy(e.target.value)} placeholder="e.g. Ama and Kojo" maxLength={120} className={inputCls} /></div>
          <div><label className={labelCls} htmlFor="sh-note">Note</label><input id="sh-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={inputCls} /></div>
        </div>
        {s.gifts.length > 0 && (
          <div>
            <div className="mb-1.5 text-sm font-semibold">Giving linked to this service</div>
            <ul className="max-h-56 divide-y divide-line-soft overflow-y-auto rounded-xl border border-line text-sm">
              {s.gifts.map((g) => (
                <li key={g.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate">{g.fund} <span className="text-xs text-ink-faint">{methodLabel(g.method)}{g.counted ? "" : `, ${g.donorName ?? "named gift"}`}</span></span>
                  <span className="tabular-nums">{ghs(g.amount)}</span>
                  <button type="button" disabled={unlink.pending} onClick={() => { setUnlinking(g.id); unlink.run(() => untagGiftFromService(g.id), "Taken out of this service. It stays in Giving.", onClose); }}
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50" aria-label="Take out of this service">
                    {unlink.pending && unlinking === g.id ? <><Spinner size="sm" /> Taking out...</> : <><Unlink className="size-3.5" /> Take out</>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end">
          <BusyButton busy={pending} busyLabel="Saving..." onClick={() => run(() => saveServiceHeader({ id: s.id, headcount: Number(headcount) || null, countedBy, note }), "Saved.", onClose)}>Save</BusyButton>
        </div>
      </div>
    </Modal>
  );
}

/** Giving on one day that is not linked to a service, with a one-tap link. */
function UnlinkedRow({ day, gifts, canLink }: { day: string; gifts: UntaggedGift[]; canLink: boolean }) {
  const { pending, run } = useLevyAction();
  const service = useServicePicker(day, { id: `link-${day}`, label: "Link to service", hint: false });
  const total = gifts.reduce((t, g) => t + g.amount, 0);
  const byFund = gifts.reduce<Record<string, number>>((m, g) => ({ ...m, [g.fund]: (m[g.fund] ?? 0) + g.amount }), {});
  return (
    <Card className="border-dashed p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">{WEEKDAY_NAMES[weekdayOf(day)]}, {dayMonth(day)}</div>
          <h3 className="font-display text-[1rem] font-semibold">Not linked to a service</h3>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-xl font-bold tabular-nums">{ghs(total)}</div>
          <div className="text-xs text-ink-muted">{gifts.length} gift{gifts.length === 1 ? "" : "s"}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Object.entries(byFund).sort((a, b) => b[1] - a[1]).map(([name, t]) => <span key={name} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs"><span className="font-medium">{name}</span> <span className="tabular-nums text-ink-muted">{ghs0(t)}</span></span>)}
      </div>
      {canLink && (
        <div className="mt-3 flex flex-col gap-2 border-t border-line-soft pt-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">{service.field}</div>
          <BusyButton busy={pending} busyLabel="Linking..." disabled={!service.pick || service.loading} className="sm:mb-0"
            onClick={() => service.pick && run(() => linkGiftsToService({ dateYmd: day, giftIds: gifts.map((g) => g.id), service: service.pick! }), (r) => String(r.message))}>
            <Link2 /> Link to service
          </BusyButton>
        </div>
      )}
    </Card>
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
  const [recording, setRecording] = useState<Recording | null>(null);
  const [editing, setEditing] = useState<ServiceCard | null>(null);
  const go = (ymd: string) => startNav(() => router.replace(`${pathname}?w=${ymd}`, { scroll: false }));
  const change = week.lastWeekTotal > 0 ? Math.round(((week.weekTotal - week.lastWeekTotal) / week.lastWeekTotal) * 100) : null;
  const isThisWeek = week.todayYmd >= week.weekStartYmd && week.todayYmd <= week.weekEndYmd;
  const defaultDate = isThisWeek ? week.todayYmd : week.weekStartYmd;
  const untaggedByDay = week.untagged.reduce<Record<string, UntaggedGift[]>>((m, g) => ({ ...m, [g.dateYmd]: [...(m[g.dateYmd] ?? []), g] }), {});
  const days = [...new Set([...week.services.map((s) => s.dateYmd), ...Object.keys(untaggedByDay)])].sort();
  const offertory = week.funds.filter((f) => f.kind === "offertory").map((f) => f.name);
  const collectionFunds = [...(offertory.length ? offertory : ["Offertory"]), ...week.funds.filter((f) => f.kind !== "offertory").map((f) => f.name)];
  const record = (date: string, service: string | null = null) => setRecording({ key: Date.now(), date, service });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Service income</h1>
          <p className="mt-1.5 max-w-xl text-sm text-ink-muted">Record your giving like you always do. This page shows what each service brought in, next to how many came.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex gap-1 rounded-xl bg-surface-2 p-1">
            {(["week", "month"] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", view === v ? "bg-surface text-ink shadow-sm" : "text-ink-muted")}>{v === "week" ? "Week" : "Month"}</button>)}
          </div>
          <DownloadButton url="/api/export/service-income" variant="secondary">Download</DownloadButton>
          {week.access.recordGiving && <button type="button" onClick={() => record(defaultDate)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"><Plus className="size-4" /> Add service record</button>}
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

          {days.length === 0 ? (
            <Empty title="No giving this week yet" text="Record giving in Giving as usual and choose which service it came in at. Each service then shows here with its total, next to how many came.">
              {week.access.recordGiving && <button type="button" onClick={() => record(defaultDate)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white"><HandCoins className="size-4" /> Record giving</button>}
            </Empty>
          ) : (
            days.map((day) => (
              <div key={day} className="grid gap-3 lg:grid-cols-2">
                {week.services.filter((s) => s.dateYmd === day).map((s) => (
                  <ServiceCardView key={s.id} s={s} access={week.access} onRecord={() => record(s.dateYmd, s.serviceName)} onEdit={() => setEditing(s)} />
                ))}
                {untaggedByDay[day] && <UnlinkedRow key={`u-${day}`} day={day} gifts={untaggedByDay[day]} canLink={week.access.manage} />}
              </div>
            ))
          )}
        </div>
      )}

      {recording && (
        <Modal open wide onClose={() => setRecording(null)} title="Add service record" description="This is the same form as Giving, so the money is recorded once. Choose the service it came in at.">
          <CollectionForm key={recording.key} funds={collectionFunds} accounts={week.accounts} initialDate={recording.date} serviceHint={recording.service ?? undefined} onDone={() => setRecording(null)} />
        </Modal>
      )}
      {editing && <HeaderDialog key={editing.id} s={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
