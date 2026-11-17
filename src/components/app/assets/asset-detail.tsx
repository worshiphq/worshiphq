"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Bus, ChevronDown, Handshake, MoreHorizontal, Pencil, Printer, Trash2, Undo2, Wrench, Archive, Plus, CalendarClock,
  ArrowUpRight, ArrowDownLeft, FileText, Hammer, Sparkles, CircleSlash,
} from "lucide-react";
import { deleteAsset } from "@/app/actions/assets";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { PhotoLightbox } from "@/components/ui/photo-lightbox";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";
import { AssetGlyph } from "@/components/app/assets-client";
import { AssetForm, type AssetFormLists } from "@/components/app/assets/asset-form";
import { CheckoutDialog, ReturnDialog } from "@/components/app/assets/checkout-dialog";
import { DisposeDialog } from "@/components/app/assets/dispose-dialog";
import { DocumentList, UploadDocSheet, type Doc } from "@/components/app/assets/documents-panel";
import { LogServiceSheet, ScheduleSheet } from "@/components/app/vehicles/service-form";
import { Dot, Pill, money, fmtDate, type Tone } from "@/components/app/shared/kit";
import { categoryLabel, conditionMeta, statusMeta, DISPOSAL_METHODS } from "@/lib/assets/categories";
import { daysUntil, type DueState } from "@/lib/fleet/due";
import type { TimelineEntry } from "@/lib/data/assets";
import type { ScheduleYear, StraightLineResult } from "@/lib/assets/depreciation";
import { cn } from "@/lib/utils";

type A = {
  id: string; name: string; tagCode: string | null; category: string; condition: string; status: string; quantity: number; serialNo: string | null;
  location: string | null; facilityId: string | null; facilityName: string | null; departmentId: string | null; departmentName: string | null;
  custodian: { id: string; name: string; phone: string | null } | null; purchaseDate: string | null; purchasePrice: number | null; supplier: string | null;
  warrantyExpires: string | null; depreciation: string; usefulLifeYears: number | null; salvageValue: number | null; inServiceDate: string | null;
  notes: string | null; photoUrl: string | null; disposedAt: string | null; disposalMethod: string | null; disposalAmount: number | null;
  vehicleId: string | null; vehicleReg: string | null; hasPurchaseExpense: boolean;
};
type Sched = { id: string; title: string; everyDays: number | null; everyKm: number | null; lastDoneAt: string | null; state: DueState; reason: string };
type Rec = { id: string; kind: string; title: string; date: string; cost: number | null; vendorName: string | null; notes: string | null; expenseId: string | null };

const toneOf = (t: string): Tone => (t === "success" || t === "warning" || t === "danger" || t === "info" ? t : "muted");
const dueTone = (s: DueState): Tone => (s === "overdue" ? "danger" : s === "soon" ? "warning" : s === "ok" ? "success" : "muted");
const TL_ICON: Record<TimelineEntry["kind"], typeof Wrench> = {
  checkout: ArrowUpRight, return: ArrowDownLeft, repair: Hammer, service: Wrench, inspection: Wrench, document: FileText, created: Sparkles, disposed: CircleSlash,
};

export function AssetDetail(props: {
  asset: A; value: StraightLineResult | null; book: { cost: number; book: number }; schedule: ScheduleYear[]; timeline: TimelineEntry[];
  openCheckout: { borrowerName: string; borrowerPhone: string | null; outAt: string; dueAt: string | null; purpose: string | null } | null;
  documents: Doc[]; schedules: Sched[]; records: Rec[]; purchaseExpenseId: string | null; lists: AssetFormLists;
  canWrite: boolean; canDelete: boolean; canPostExpenses: boolean;
}) {
  const { asset: a, value, book, schedule, timeline, openCheckout, documents, schedules, records, lists, canWrite, canDelete, canPostExpenses } = props;
  const router = useRouter();
  const { toast } = useFeedback();
  const [tab, setTab] = useState<"history" | "maintenance" | "documents">("history");
  const [dialog, setDialog] = useState<"" | "edit" | "lend" | "return" | "dispose" | "repair" | "service" | "schedule" | "upload">("");
  const [editSched, setEditSched] = useState<Sched | null>(null);
  const [menu, setMenu] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [deleting, startDelete] = useTransition();
  const st = statusMeta(a.status);
  const disposed = a.status === "disposed";
  const warrantyDays = a.warrantyExpires ? daysUntil(a.warrantyExpires) : null;
  const lateDays = openCheckout?.dueAt ? -daysUntil(openCheckout.dueAt) : 0;

  const remove = () => {
    if (!confirmBinDelete(`Delete ${a.name}? It goes to the recycle bin.`)) return;
    const fd = new FormData();
    fd.set("id", a.id);
    startDelete(async () => {
      const r = await deleteAsset(fd);
      if (r.ok) { binDeleted(); router.push("/app/assets"); } else toast(r.error ?? "Could not delete it.", "error");
    });
  };

  const primary = !canWrite || disposed ? null
    : openCheckout ? <Button onClick={() => setDialog("return")}><Undo2 /> Mark returned</Button>
      : a.status === "in-repair" ? <Button onClick={() => setDialog("repair")}><Wrench /> Log repair</Button>
        : <Button onClick={() => setDialog("lend")}><Handshake /> Lend out</Button>;

  const facts: [string, React.ReactNode][] = [
    ["Category", categoryLabel(a.category)],
    ["Quantity", a.quantity > 1 ? `${a.quantity}` : "1"],
    ["Serial number", a.serialNo ? <span className="font-mono text-xs">{a.serialNo}</span> : null],
    ["Room", a.facilityName ?? a.location],
    ["Department", a.departmentName],
    ["Looked after by", a.custodian?.name],
    ["Condition", <Dot key="c" tone={toneOf(conditionMeta(a.condition).tone)}>{conditionMeta(a.condition).label}</Dot>],
    ["Supplier", a.supplier],
    ["Bought", a.purchaseDate || a.purchasePrice ? <span key="b" className="tabular-nums">{[fmtDate(a.purchaseDate), a.purchasePrice ? `${money(a.purchasePrice, true)}${a.quantity > 1 ? " each" : ""}` : null].filter(Boolean).join(", ")}{props.purchaseExpenseId && <Link href="/app/expenses" className="ml-1.5 text-xs text-primary hover:underline">in Expenses</Link>}</span> : null],
    ["Warranty", a.warrantyExpires ? <span key="w">{fmtDate(a.warrantyExpires)} {warrantyDays != null && <Dot tone={warrantyDays < 0 ? "muted" : warrantyDays <= 30 ? "warning" : "success"} className="ml-1">{warrantyDays < 0 ? "ended" : `${warrantyDays} days left`}</Dot>}</span> : null],
  ];

  return (
    <div className="space-y-5">
      <Link href="/app/assets" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="size-4" /> Assets</Link>

      {a.vehicleId && (
        <Link href={`/app/vehicles/${a.vehicleId}`} className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary-soft/30 px-4 py-3 text-sm text-ink hover:border-primary">
          <Bus className="size-5 text-primary" /> <span className="flex-1">This is a vehicle ({a.vehicleReg}). Open trips, fuel and papers.</span> <ArrowUpRight className="size-4 text-primary" />
        </Link>
      )}

      {/* Header: the thing itself, then what you would do with it next. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <button onClick={() => a.photoUrl && setZoom(true)} className={cn("shrink-0", !a.photoUrl && "cursor-default")} aria-label={a.photoUrl ? "View photo" : undefined}>
          <AssetGlyph category={a.category} photoUrl={a.photoUrl} size={112} className="rounded-2xl" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={toneOf(st.tone)}>{st.label}</Pill>
            {a.tagCode && <span className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-xs text-ink-muted">{a.tagCode}</span>}
          </div>
          <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight sm:text-3xl">{a.name}{a.quantity > 1 && <span className="text-ink-muted"> x{a.quantity}</span>}</h1>
          {openCheckout && (
            <p className={cn("mt-1 text-sm", lateDays > 0 ? "font-medium text-danger" : "text-ink-muted")}>
              With {openCheckout.borrowerName}{openCheckout.borrowerPhone ? ` (${openCheckout.borrowerPhone})` : ""} since {fmtDate(openCheckout.outAt, false)}
              {openCheckout.dueAt && (lateDays > 0 ? `, ${lateDays} day${lateDays === 1 ? "" : "s"} late` : `, due back ${fmtDate(openCheckout.dueAt, false)}`)}
            </p>
          )}
          {disposed && <p className="mt-1 text-sm text-ink-muted">{DISPOSAL_METHODS.find((m) => m.key === a.disposalMethod)?.label ?? "Disposed"} on {fmtDate(a.disposedAt)}{a.disposalAmount ? ` for ${money(a.disposalAmount)}` : ""}</p>}
        </div>
        <div className="flex items-center gap-2">
          {primary}
          <div className="relative">
            <Button variant="secondary" onClick={() => setMenu((m) => !m)} aria-expanded={menu}><MoreHorizontal /> More</Button>
            {menu && (
              <div className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-line bg-surface p-1 shadow-xl" onClick={() => setMenu(false)}>
                {canWrite && <MenuItem icon={Pencil} onClick={() => setDialog("edit")}>Edit</MenuItem>}
                <Link href={`/app/assets/tags?ids=${a.id}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"><Printer className="size-4" /> Print tag</Link>
                {canWrite && !disposed && <MenuItem icon={Wrench} onClick={() => setDialog("repair")}>Log repair</MenuItem>}
                {canWrite && !disposed && !a.vehicleId && <MenuItem icon={Archive} onClick={() => setDialog("dispose")}>Dispose</MenuItem>}
                {canDelete && !a.vehicleId && <MenuItem icon={Trash2} danger onClick={remove} busy={deleting}>Delete</MenuItem>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Facts</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {facts.filter(([, v]) => v != null && v !== "").map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-ink-muted">{k}</dt><dd className="min-w-0 text-ink">{v}</dd></div>
            ))}
          </dl>
          {a.notes && <p className="mt-4 whitespace-pre-line rounded-lg bg-surface-2/60 px-3 py-2 text-sm text-ink-muted">{a.notes}</p>}
        </Card>

        <Card className="p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Value</h2>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">{money(book.book)}</p>
          <p className="text-sm text-ink-muted">
            {disposed ? "No longer counted in the register." : value ? `Loses about ${money(value.annual * a.quantity)} a year${value.fullyDepreciated ? ". Fully worn down." : ""}` : book.cost ? "Counted at what it cost. Turn on \"Lose value each year\" in Edit to see it wear down." : "No cost recorded."}
          </p>
          {schedule.length > 1 && !disposed && (
            <>
              <ValueLine schedule={schedule} />
              <button onClick={() => setShowSchedule((s) => !s)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                <ChevronDown className={cn("size-3.5 transition-transform", showSchedule && "rotate-180")} /> Year by year
              </button>
              {showSchedule && (
                <table className="mt-2 w-full text-xs tabular-nums">
                  <thead className="text-left text-ink-faint"><tr><th className="py-1">Year</th><th className="py-1 text-right">Start</th><th className="py-1 text-right">Worn</th><th className="py-1 text-right">End</th></tr></thead>
                  <tbody className="divide-y divide-line-soft">
                    {schedule.map((y) => <tr key={y.year}><td className="py-1">{y.year}</td><td className="py-1 text-right">{money(y.opening)}</td><td className="py-1 text-right">{money(y.charge)}</td><td className="py-1 text-right font-medium">{money(y.closing)}</td></tr>)}
                  </tbody>
                </table>
              )}
            </>
          )}
        </Card>
      </div>

      <div>
        <div className="flex gap-1 border-b border-line" role="tablist">
          {([["history", "History"], ["maintenance", `Maintenance${schedules.length ? ` (${schedules.length})` : ""}`], ["documents", `Documents${documents.length ? ` (${documents.length})` : ""}`]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === k ? "border-primary text-ink" : "border-transparent text-ink-muted hover:text-ink")}>{label}</button>
          ))}
        </div>
        <Card className="mt-3 p-5">
          {tab === "history" && (
            <ol className="relative space-y-4 border-l border-line pl-5">
              {timeline.map((t, i) => {
                const Icon = TL_ICON[t.kind];
                return (
                  <li key={i} className="relative">
                    <span className="absolute -left-[1.95rem] grid size-6 place-items-center rounded-full border border-line bg-surface text-ink-muted"><Icon className="size-3" /></span>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-sm font-medium">{t.title}</p>
                      <span className="text-xs text-ink-faint">{fmtDate(t.at)}</span>
                    </div>
                    {(t.detail || t.amount) && <p className="text-xs text-ink-muted">{[t.detail, t.amount ? money(t.amount, true) : null].filter(Boolean).join(" · ")}</p>}
                  </li>
                );
              })}
            </ol>
          )}
          {tab === "maintenance" && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Schedules</h3>
                  {canWrite && !disposed && <Button size="sm" variant="ghost" onClick={() => { setEditSched(null); setDialog("schedule"); }}><Plus /> Add</Button>}
                </div>
                {schedules.length === 0 ? <p className="mt-2 text-sm text-ink-faint">No regular service set. Add one for things like the generator or air conditioners.</p> : (
                  <ul className="mt-2 divide-y divide-line-soft">
                    {schedules.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                        <CalendarClock className="size-4 text-ink-faint" />
                        <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{s.title}</span><span className="text-ink-muted"> every {s.everyDays ? `${Math.round(s.everyDays / 30)} months` : `${s.everyKm?.toLocaleString("en-GB")} km`}</span></span>
                        <Dot tone={dueTone(s.state)}>{s.state === "overdue" ? `Overdue, ${s.reason}` : s.state === "soon" ? `Due ${s.reason}` : `Next ${s.reason}`}</Dot>
                        {canWrite && <Button size="sm" variant="secondary" onClick={() => { setEditSched(s); setDialog("service"); }}>Done</Button>}
                        {canWrite && <button onClick={() => { setEditSched(s); setDialog("schedule"); }} className="text-xs text-ink-muted hover:text-ink">Edit</button>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Service and repair history</h3>
                  {canWrite && !disposed && <Button size="sm" variant="ghost" onClick={() => { setEditSched(null); setDialog("repair"); }}><Plus /> Log</Button>}
                </div>
                {records.length === 0 ? <p className="mt-2 text-sm text-ink-faint">Nothing logged yet.</p> : (
                  <ul className="mt-2 divide-y divide-line-soft">
                    {records.map((r) => (
                      <li key={r.id} className="flex items-start gap-3 py-2.5 text-sm">
                        <span className="w-20 shrink-0 text-xs text-ink-faint">{fmtDate(r.date)}</span>
                        <span className="min-w-0 flex-1"><span className="font-medium">{r.title}</span>{r.vendorName && <span className="text-ink-muted"> · {r.vendorName}</span>}{r.notes && <span className="block text-xs text-ink-muted">{r.notes}</span>}</span>
                        {r.cost != null && <span className="shrink-0 text-right tabular-nums">{money(r.cost, true)}{r.expenseId && <span className="block text-[10px] text-ink-faint">in Expenses</span>}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {tab === "documents" && (
            <div>
              {canWrite && <div className="mb-2 flex justify-end"><Button size="sm" variant="secondary" onClick={() => setDialog("upload")}><Plus /> Add document</Button></div>}
              <DocumentList docs={documents} canWrite={canWrite} canDelete={canDelete} />
            </div>
          )}
        </Card>
      </div>

      {zoom && a.photoUrl && <PhotoLightbox src={a.photoUrl} alt={a.name} onClose={() => setZoom(false)} />}
      {dialog === "edit" && (
        <AssetForm
          lists={lists} canPostExpenses={canPostExpenses} onClose={() => setDialog("")}
          asset={{ ...a, custodian: a.custodian ? { id: a.custodian.id, name: a.custodian.name } : null }}
        />
      )}
      {dialog === "lend" && <CheckoutDialog assetId={a.id} name={a.name} condition={a.condition} onClose={() => setDialog("")} />}
      {dialog === "return" && openCheckout && <ReturnDialog assetId={a.id} name={a.name} borrower={openCheckout.borrowerName} onClose={() => setDialog("")} />}
      {dialog === "dispose" && <DisposeDialog assetId={a.id} name={a.name} bookValue={book.book} accounts={lists.accounts} onClose={() => setDialog("")} />}
      {(dialog === "repair" || dialog === "service") && (
        <LogServiceSheet assetId={a.id} isVehicle={!!a.vehicleId} schedules={schedules} scheduleId={dialog === "service" ? editSched?.id : null} defaultKind={dialog === "repair" ? "repair" : "service"} accounts={lists.accounts} canPostExpenses={canPostExpenses} onClose={() => setDialog("")} />
      )}
      {dialog === "schedule" && <ScheduleSheet assetId={a.id} isVehicle={!!a.vehicleId} schedule={editSched} onClose={() => setDialog("")} />}
      {dialog === "upload" && <UploadDocSheet assetId={a.id} onClose={() => setDialog("")} />}
    </div>
  );
}

function MenuItem({ icon: Icon, children, onClick, danger, busy }: { icon: typeof Pencil; children: React.ReactNode; onClick: () => void; danger?: boolean; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2", danger && "text-danger hover:bg-danger/10")}>
      <Icon className="size-4" /> {busy ? "Working…" : children}
    </button>
  );
}

/** A small line of book value over the item's life, with today marked. */
function ValueLine({ schedule }: { schedule: ScheduleYear[] }) {
  const pts = [{ year: schedule[0].year, v: schedule[0].opening }, ...schedule.map((y) => ({ year: y.year + 1, v: y.closing }))];
  const max = pts[0].v || 1;
  const W = 280, H = 60;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - 4 - (v / max) * (H - 8);
  const nowYear = new Date().getUTCFullYear() + new Date().getUTCMonth() / 12;
  const nowX = ((nowYear - pts[0].year) / (pts[pts.length - 1].year - pts[0].year)) * W;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-16 w-full text-primary" role="img" aria-label="Book value over its life">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={pts.map((p, i) => `${x(i)},${y(p.v)}`).join(" ")} />
      {nowX >= 0 && nowX <= W && <line x1={nowX} x2={nowX} y1={0} y2={H} stroke="var(--color-ink-faint)" strokeDasharray="3 3" />}
      <text x={0} y={H} className="fill-[var(--color-ink-faint)] text-[9px]">{pts[0].year}</text>
      <text x={W} y={H} textAnchor="end" className="fill-[var(--color-ink-faint)] text-[9px]">{pts[pts.length - 1].year}</text>
    </svg>
  );
}
