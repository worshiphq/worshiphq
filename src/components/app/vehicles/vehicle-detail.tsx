"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bus, Fuel, Gauge, MoreHorizontal, Pencil, Plus, Route, Trash2, Wrench, Flag, CalendarClock, Paperclip, Upload, Download } from "lucide-react";
import { deleteVehicle, saveDriver, removeDriver, deleteFuel, deleteTrip } from "@/app/actions/vehicles";
import { searchTrips, searchPickerPeople } from "@/app/actions/lists";
import { useServerList } from "@/components/ui/use-server-list";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { Spinner } from "@/components/ui/spinner";
import { SearchSelect } from "@/components/app/search-select";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";
import { Dot, Sheet, BusyButton, FormError, F, Select, money, fmtDate, ymdOf } from "@/components/app/shared/kit";
import { Plate } from "@/components/app/vehicles/plate";
import { VehicleForm, VEHICLE_KIND_OPTIONS, FUEL_OPTIONS, type VehicleFormValue } from "@/components/app/vehicles/vehicle-form";
import { StartTripSheet, EndTripSheet, PURPOSE_OPTIONS, purposeLabel } from "@/components/app/vehicles/trip-sheet";
import { FuelSheet } from "@/components/app/vehicles/fuel-form";
import { LogServiceSheet, ScheduleSheet, type Account } from "@/components/app/vehicles/service-form";
import { DocumentList, UploadDocSheet, type Doc } from "@/components/app/assets/documents-panel";
import { dueTone, paperWords } from "@/components/app/vehicles/fleet-client";
import { expiryState, type DueState } from "@/lib/fleet/due";
import type { Paper } from "@/lib/data/fleet";
import { cn } from "@/lib/utils";

type V = VehicleFormValue & { assetId: string; odometerAt: string | null; tagCode: string | null };
type Driver = { id: string; name: string; phone: string | null; licenceNo: string | null; licenceClass: string | null; licenceExpires: string | null; isPrimary: boolean; personId: string | null };
type TripRow = { id: string; regNumber: string; vehicleId: string; purpose: string; destination: string | null; driverName: string | null; startAt: string; endAt: string | null; odometerStart: number | null; odometerEnd: number | null; km: number | null; passengers: number | null; note: string | null };
type FuelRow = { id: string; date: string; litres: number; cost: number; odometer: number | null; station: string | null; fullTank: boolean; receiptUrl: string | null; posting: "posted" | "waiting" | "none"; expenseId: string | null };
type Sched = { id: string; title: string; everyDays: number | null; everyKm: number | null; lastDoneAt: string | null; state: DueState; reason: string };
type Rec = { id: string; kind: string; title: string; date: string; cost: number | null; vendorName: string | null; odometerKm: number | null; expenseId: string | null };

export function VehicleDetail(p: {
  vehicle: V; papers: Paper[]; month: { km: number; fuelCost: number; fuelLitres: number; repairCost: number; kmPerLitre: number | null; costPerKm: number | null; label: string } | null;
  drivers: Driver[]; openTrip: { id: string; driverName: string | null; purpose: string; startAt: string; odometerStart: number | null } | null;
  trips: { rows: TripRow[]; total: number; page: number; extra?: { totalKm: number } }; fuel: FuelRow[]; schedules: Sched[]; records: Rec[]; documents: Doc[];
  accounts: Account[]; canWrite: boolean; canDelete: boolean; canDeleteExpense: boolean; canPostExpenses: boolean;
}) {
  const { vehicle: v, canWrite, canDelete } = p;
  const router = useRouter();
  const { toast } = useFeedback();
  const [tab, setTab] = useState<"overview" | "trips" | "fuel" | "maintenance">("overview");
  const [dialog, setDialog] = useState<string>("");
  const [sched, setSched] = useState<Sched | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [menu, setMenu] = useState(false);
  const [deleting, startDelete] = useTransition();
  const close = () => { setDialog(""); setSched(null); setDriver(null); };
  const fleet = [{ id: v.id, regNumber: v.regNumber, name: v.name, odometerKm: v.odometerKm, drivers: p.drivers, openTrip: p.openTrip, active: v.active }];

  const remove = () => {
    if (!confirmBinDelete(`Remove ${v.regNumber}? Its trips, fuel, drivers and papers go to the recycle bin with it.`)) return;
    const fd = new FormData();
    fd.set("id", v.id);
    startDelete(async () => {
      const r = await deleteVehicle(fd);
      if (r.ok) { binDeleted(); router.push("/app/vehicles"); } else toast(r.error ?? "Could not remove it.", "error");
    });
  };

  return (
    <div className="space-y-5">
      <Link href="/app/vehicles" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="size-4" /> Vehicles</Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-surface-2 text-ink-faint">
          {v.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.photoUrl} alt="" className="size-full object-cover" />
          ) : <Bus className="size-8" />}
        </span>
        <div className="min-w-0 flex-1">
          <Plate reg={v.regNumber} size="lg" />
          <p className="mt-1.5 text-sm text-ink-muted">
            {v.name} · {[v.make, v.model, v.year].filter(Boolean).join(" ") || VEHICLE_KIND_OPTIONS.find((k) => k.value === v.kind)?.label}
            {v.tagCode && <span className="ml-2 font-mono text-xs">{v.tagCode}</span>}
          </p>
          {p.openTrip && <p className="mt-1"><Dot tone="info">On a trip{p.openTrip.driverName ? ` with ${p.openTrip.driverName}` : ""} ({purposeLabel(p.openTrip.purpose)})</Dot></p>}
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            {v.active && (p.openTrip
              ? <Button onClick={() => setDialog("end")}><Flag /> End trip</Button>
              : <Button onClick={() => setDialog("trip")}><Route /> Start trip</Button>)}
            <Button variant="secondary" onClick={() => setDialog("fuel")}><Fuel /> Fuel</Button>
            <div className="relative">
              <Button variant="secondary" onClick={() => setMenu((m) => !m)} aria-label="More"><MoreHorizontal /></Button>
              {menu && (
                <div className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-line bg-surface p-1 shadow-xl" onClick={() => setMenu(false)}>
                  <button onClick={() => setDialog("edit")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"><Pencil className="size-4" /> Edit</button>
                  <button onClick={() => setDialog("service")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"><Wrench className="size-4" /> Log service or repair</button>
                  <button onClick={() => setDialog("pasttrip")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"><Route className="size-4" /> Record a past trip</button>
                  {canDelete && <button onClick={remove} disabled={deleting} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"><Trash2 className="size-4" /> {deleting ? "Removing…" : "Remove vehicle"}</button>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {p.month && (
        <Card className="grid grid-cols-2 divide-line p-0 sm:grid-cols-4 sm:divide-x">
          {[
            ["Km driven", `${p.month.km.toLocaleString("en-GB")} km`],
            ["Fuel", money(p.month.fuelCost)],
            ["Repairs", money(p.month.repairCost)],
            ["Cost per km", p.month.costPerKm != null ? money(p.month.costPerKm, true) : "-"],
          ].map(([k, val], i) => (
            <div key={k} className={cn("p-4", i < 2 && "border-b border-line sm:border-b-0")}>
              <p className="text-xs text-ink-faint">{k} in {p.month!.label}</p>
              <p className="mt-0.5 font-display text-xl font-bold tabular-nums">{val}</p>
            </div>
          ))}
        </Card>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {([["overview", "Overview"], ["trips", `Trips (${p.trips.total})`], ["fuel", "Fuel"], ["maintenance", "Maintenance"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", tab === k ? "border-primary text-ink" : "border-transparent text-ink-muted hover:text-ink")}>{label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Papers</h2>
              {canWrite && <Button size="sm" variant="ghost" onClick={() => setDialog("papers")}>Update dates</Button>}
            </div>
            <ul className="mt-2 divide-y divide-line-soft">
              {p.papers.map((x) => (
                <li key={x.key} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="flex-1"><span className="font-medium">{x.label}</span>{x.date && <span className="block text-xs text-ink-muted">{fmtDate(x.date)}</span>}</span>
                  <Dot tone={dueTone(x.state)}>{paperWords(x)}</Dot>
                  {canWrite && <button onClick={() => setDialog(`upload:${x.key}`)} className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-surface-2 hover:text-ink" aria-label={`Upload ${x.label} document`}><Upload className="size-4" /></button>}
                </li>
              ))}
            </ul>
            {(v.insurer || v.insurancePolicyNo) && <p className="mt-2 text-xs text-ink-muted">Insured with {v.insurer ?? "?"}{v.insurancePolicyNo ? `, policy ${v.insurancePolicyNo}` : ""}{v.insuranceType ? ` (${v.insuranceType === "comprehensive" ? "comprehensive" : "third party"})` : ""}</p>}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Drivers</h2>
              {canWrite && <Button size="sm" variant="ghost" onClick={() => { setDriver(null); setDialog("driver"); }}><Plus /> Add</Button>}
            </div>
            {p.drivers.length === 0 ? <p className="mt-2 text-sm text-ink-faint">No drivers yet. Add who drives it, with their licence date.</p> : (
              <ul className="mt-2 divide-y divide-line-soft">
                {p.drivers.map((d) => {
                  const e = expiryState(d.licenceExpires);
                  return (
                    <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{d.name}</span>{d.isPrimary && <span className="ml-1.5 text-xs text-primary">main driver</span>}
                        <span className="block text-xs text-ink-muted">{[d.phone, d.licenceClass ? `Class ${d.licenceClass}` : null].filter(Boolean).join(" · ") || "No details"}</span>
                      </span>
                      <Dot tone={dueTone(e.state)}>{e.state === "unset" ? "Licence date not set" : e.state === "overdue" ? "Licence expired" : `Licence ${paperWords(e).toLowerCase()}`}</Dot>
                      {canWrite && <button onClick={() => { setDriver(d); setDialog("driver"); }} className="text-xs text-ink-muted hover:text-ink">Edit</button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Details</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {([
                ["Kind", VEHICLE_KIND_OPTIONS.find((k) => k.value === v.kind)?.label],
                ["Seats", v.seats],
                ["Fuel", FUEL_OPTIONS.find((f) => f.value === v.fuelType)?.label],
                ["Colour", v.colour],
                ["Chassis", v.chassisNo],
                ["Odometer", <span key="o" className="inline-flex items-center gap-1 tabular-nums"><Gauge className="size-3.5" /> {v.odometerKm.toLocaleString("en-GB")} km{v.odometerAt ? <span className="text-xs text-ink-faint"> on {fmtDate(v.odometerAt, false)}</span> : null}</span>],
                ["Bought", v.purchaseDate || v.purchasePrice ? [fmtDate(v.purchaseDate), v.purchasePrice ? money(v.purchasePrice) : null].filter(Boolean).join(", ") : null],
                ["km per litre", p.month?.kmPerLitre ?? null],
              ] as [string, React.ReactNode][]).filter(([, x]) => x != null && x !== "").map(([k, x]) => (
                <div key={k} className="contents"><dt className="text-ink-muted">{k}</dt><dd>{x}</dd></div>
              ))}
            </dl>
            {v.notes && <p className="mt-3 rounded-lg bg-surface-2/60 px-3 py-2 text-sm text-ink-muted">{v.notes}</p>}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Documents</h2>
              {canWrite && <Button size="sm" variant="ghost" onClick={() => setDialog("upload:other")}><Plus /> Add</Button>}
            </div>
            <DocumentList docs={p.documents} canWrite={canWrite} canDelete={canDelete} vehicle />
          </Card>
        </div>
      )}

      {tab === "trips" && <TripsTab vehicleId={v.id} initial={p.trips} canDelete={canDelete} />}

      {tab === "fuel" && <FuelTab rows={p.fuel} canDelete={canDelete} canDeleteExpense={p.canDeleteExpense} />}

      {tab === "maintenance" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Service schedule</h2>
              {canWrite && <Button size="sm" variant="ghost" onClick={() => { setSched(null); setDialog("schedule"); }}><Plus /> Add</Button>}
            </div>
            {p.schedules.length === 0 ? <p className="mt-2 text-sm text-ink-faint">Add things like &quot;Engine oil every 5,000 km or 6 months&quot; and you will be told when they are due.</p> : (
              <ul className="mt-2 divide-y divide-line-soft">
                {p.schedules.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <CalendarClock className="size-4 text-ink-faint" />
                    <span className="min-w-0 flex-1"><span className="font-medium">{s.title}</span><span className="block text-xs text-ink-muted">Every {[s.everyKm ? `${s.everyKm.toLocaleString("en-GB")} km` : null, s.everyDays ? `${Math.round(s.everyDays / 30)} months` : null].filter(Boolean).join(" or ")}</span></span>
                    <Dot tone={dueTone(s.state)}>{s.state === "overdue" ? `Overdue (${s.reason})` : s.state === "soon" ? `Due ${s.reason}` : `Next ${s.reason}`}</Dot>
                    {canWrite && <Button size="sm" variant="secondary" onClick={() => { setSched(s); setDialog("service"); }}>Done</Button>}
                    {canWrite && <button onClick={() => { setSched(s); setDialog("schedule"); }} className="text-xs text-ink-muted hover:text-ink">Edit</button>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Service history</h2>
              {canWrite && <Button size="sm" variant="ghost" onClick={() => { setSched(null); setDialog("service"); }}><Plus /> Log</Button>}
            </div>
            {p.records.length === 0 ? <p className="mt-2 text-sm text-ink-faint">Nothing logged yet.</p> : (
              <ul className="mt-2 divide-y divide-line-soft">
                {p.records.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 py-2.5 text-sm">
                    <span className="w-20 shrink-0 text-xs text-ink-faint">{fmtDate(r.date)}</span>
                    <span className="min-w-0 flex-1"><span className="font-medium">{r.title}</span><span className="block text-xs text-ink-muted">{[r.kind === "repair" ? "Repair" : r.kind === "inspection" ? "Inspection" : "Service", r.vendorName, r.odometerKm ? `${r.odometerKm.toLocaleString("en-GB")} km` : null].filter(Boolean).join(" · ")}</span></span>
                    {r.cost != null && <span className="text-right tabular-nums">{money(r.cost, true)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {dialog === "edit" && <VehicleForm vehicle={v} onClose={close} />}
      {dialog === "papers" && <VehicleForm vehicle={v} focus="papers" onClose={close} />}
      {dialog === "trip" && <StartTripSheet vehicles={fleet} vehicleId={v.id} onClose={close} />}
      {dialog === "pasttrip" && <StartTripSheet vehicles={fleet} vehicleId={v.id} full onClose={close} />}
      {dialog === "end" && p.openTrip && <EndTripSheet tripId={p.openTrip.id} regNumber={v.regNumber} odometerStart={p.openTrip.odometerStart} onClose={close} />}
      {dialog === "fuel" && <FuelSheet vehicles={[{ id: v.id, regNumber: v.regNumber, odometerKm: v.odometerKm, active: v.active }]} vehicleId={v.id} accounts={p.accounts} canPostExpenses={p.canPostExpenses} onClose={close} />}
      {dialog === "service" && <LogServiceSheet assetId={v.assetId} isVehicle odometerKm={v.odometerKm} schedules={p.schedules} scheduleId={sched?.id} accounts={p.accounts} canPostExpenses={p.canPostExpenses} onClose={close} />}
      {dialog === "schedule" && <ScheduleSheet assetId={v.assetId} isVehicle odometerKm={v.odometerKm} schedule={sched} onClose={close} />}
      {dialog === "driver" && <DriverSheet vehicleId={v.id} driver={driver} onClose={close} canDelete={canDelete} />}
      {dialog.startsWith("upload:") && <UploadDocSheet assetId={v.assetId} vehicle defaultKind={dialog.slice(7)} onClose={close} />}
    </div>
  );
}

function DriverSheet({ vehicleId, driver, canDelete, onClose }: { vehicleId: string; driver: Driver | null; canDelete: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [removing, startRemove] = useTransition();
  const [error, setError] = useState("");
  const [person, setPerson] = useState(driver?.personId ?? "");
  const submit = (fd: FormData) => {
    setError("");
    fd.set("vehicleId", vehicleId);
    fd.set("personId", person);
    if (driver) fd.set("id", driver.id);
    start(async () => {
      const r = await saveDriver(fd);
      if (r.ok) { toast("Driver saved", "success"); router.refresh(); onClose(); } else setError(r.error ?? "That did not save.");
    });
  };
  const remove = () => {
    if (!driver || !confirmBinDelete(`Remove ${driver.name} as a driver?`)) return;
    const fd = new FormData();
    fd.set("id", driver.id);
    startRemove(async () => {
      const r = await removeDriver(fd);
      if (r.ok) { binDeleted(); router.refresh(); onClose(); } else setError(r.error ?? "Could not remove.");
    });
  };
  return (
    <Sheet open onClose={onClose} busy={pending || removing} title={driver ? `Edit ${driver.name}` : "Add a driver"}>
      <form action={submit} className="space-y-4">
        <F label="Member (optional)">
          <SearchSelect value={person} onChange={(x) => setPerson(x)} options={[{ value: "", label: "Not a member / type the name" }, ...(driver?.personId ? [{ value: driver.personId, label: driver.name }] : [])]} placeholder="Search for a person…" search={(q) => searchPickerPeople("vehicles", q, { who: "notVisitor" })} />
        </F>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Name" htmlFor="d-n"><Input id="d-n" name="name" defaultValue={driver?.name ?? ""} placeholder={person ? "From the member record" : "Full name"} /></F>
          <F label="Phone" htmlFor="d-p"><Input id="d-p" name="phone" type="tel" inputMode="tel" defaultValue={driver?.phone ?? ""} /></F>
          <F label="Licence number" htmlFor="d-l"><Input id="d-l" name="licenceNo" defaultValue={driver?.licenceNo ?? ""} /></F>
          <F label="Licence class" htmlFor="d-c"><Select id="d-c" name="licenceClass" defaultValue={driver?.licenceClass ?? ""} options={[{ value: "", label: "Not set" }, ...["A", "B", "C", "D", "E", "F"].map((x) => ({ value: x, label: `Class ${x}` }))]} /></F>
          <F label="Licence ends" htmlFor="d-e"><Input id="d-e" name="licenceExpires" type="date" defaultValue={ymdOf(driver?.licenceExpires)} /></F>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPrimary" value="1" defaultChecked={driver?.isPrimary} className="size-4 accent-[var(--color-primary)]" /> Main driver for this vehicle</label>
        <FormError error={error} />
        <div className="flex gap-2">
          {driver && canDelete && <BusyButton type="button" variant="ghost" busy={removing} busyLabel="Removing…" onClick={remove} className="text-danger">Remove</BusyButton>}
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <BusyButton busy={pending} className="flex-1">Save driver</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}

function TripsTab({ vehicleId, initial, canDelete }: { vehicleId: string; initial: { rows: TripRow[]; total: number; page: number; extra?: { totalKm: number } }; canDelete: boolean }) {
  const router = useRouter();
  const [month, setMonth] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();
  const list = useServerList<TripRow, { vehicleId: string; month: string; purpose: string }, { totalKm: number }>({ initial, query: "", filters: { vehicleId, month, purpose }, fetchPage: searchTrips, pageSize: 25 });
  const remove = (id: string) => {
    if (!confirmBinDelete("Delete this trip?")) return;
    const fd = new FormData();
    fd.set("id", id);
    setBusyId(id);
    start(async () => { const r = await deleteTrip(fd); setBusyId(null); if (r.ok) { binDeleted(); router.refresh(); } });
  };
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-auto" aria-label="Month" />
        <Select className="h-9 w-auto py-0 text-xs" value={purpose} onChange={setPurpose} options={[{ value: "", label: "Any purpose" }, ...PURPOSE_OPTIONS]} />
        {list.searching && <Spinner size="sm" className="text-primary" />}
        <span className="ml-auto text-sm text-ink-muted tabular-nums">{list.total} trip{list.total === 1 ? "" : "s"} · {(list.extra?.totalKm ?? 0).toLocaleString("en-GB")} km</span>
        <a href={`/api/export/vehicle-trips?format=xlsx`} className="text-xs font-medium text-primary"><Download className="inline size-3.5" /> Export</a>
      </div>
      {list.rows.length === 0 ? <p className="px-4 py-10 text-center text-sm text-ink-faint">No trips here.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-surface-2/50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              <tr><th className="px-4 py-2">When</th><th className="px-3 py-2">What for</th><th className="px-3 py-2">Driver</th><th className="px-3 py-2 text-right">Km</th><th className="px-3 py-2 text-right">People</th><th className="w-10" /></tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {list.rows.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2.5">{fmtDate(t.startAt)}{!t.endAt && <Dot tone="info" className="ml-2">On the road</Dot>}</td>
                  <td className="px-3 py-2.5">{purposeLabel(t.purpose)}{t.destination && <span className="block text-xs text-ink-muted">{t.destination}</span>}</td>
                  <td className="px-3 py-2.5 text-ink-muted">{t.driverName ?? "-"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.km != null ? t.km.toLocaleString("en-GB") : "-"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.passengers ?? "-"}</td>
                  <td className="px-2">{canDelete && <button onClick={() => remove(t.id)} className="grid size-8 place-items-center rounded-lg text-ink-faint hover:text-danger" aria-label="Delete trip">{busyId === t.id ? <Spinner size="sm" /> : <Trash2 className="size-4" />}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.pager}
    </Card>
  );
}

function FuelTab({ rows, canDelete, canDeleteExpense }: { rows: FuelRow[]; canDelete: boolean; canDeleteExpense: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();
  // km per litre for each full tank, measured from the previous full tank.
  const sorted = [...rows].filter((r) => r.odometer != null).sort((a, b) => a.odometer! - b.odometer!);
  const kpl = new Map<string, number>();
  let lastFull: FuelRow | null = null, litres = 0;
  for (const r of sorted) {
    if (lastFull) litres += r.litres;
    if (r.fullTank) {
      if (lastFull && litres > 0 && r.odometer! > lastFull.odometer!) kpl.set(r.id, Math.round(((r.odometer! - lastFull.odometer!) / litres) * 10) / 10);
      lastFull = r; litres = 0;
    }
  }
  const remove = (r: FuelRow) => {
    let also = false;
    if (r.expenseId && canDeleteExpense) also = window.confirm("Also delete the expense it recorded? Press Cancel to keep the expense.");
    if (!confirmBinDelete("Delete this fuel entry?")) return;
    const fd = new FormData();
    fd.set("id", r.id);
    if (also) fd.set("alsoExpense", "1");
    setBusyId(r.id);
    start(async () => { const res = await deleteFuel(fd); setBusyId(null); if (res.ok) { binDeleted(); router.refresh(); } else toast(res.error ?? "Could not delete.", "error"); });
  };
  if (!rows.length) return <Card className="px-4 py-10 text-center text-sm text-ink-faint">No fuel logged yet.</Card>;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="bg-surface-2/50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          <tr><th className="px-4 py-2">Date</th><th className="px-3 py-2 text-right">Litres</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-right">Per litre</th><th className="px-3 py-2 text-right">Km per litre</th><th className="px-3 py-2">Money</th><th className="w-10" /></tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2.5">{fmtDate(r.date)}<span className="block text-xs text-ink-muted">{[r.station, r.odometer ? `${r.odometer.toLocaleString("en-GB")} km` : null].filter(Boolean).join(" · ")}</span></td>
              <td className="px-3 py-2.5 text-right tabular-nums">{r.litres.toLocaleString("en-GB")}{!r.fullTank && <span className="block text-[10px] text-ink-faint">part fill</span>}</td>
              <td className="px-3 py-2.5 text-right font-medium tabular-nums">{money(r.cost, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{r.litres ? money(r.cost / r.litres, true) : "-"}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{kpl.get(r.id) ?? "-"}</td>
              <td className="px-3 py-2.5">
                {r.posting === "posted" ? <Dot tone="success">Posted to expenses</Dot> : r.posting === "waiting" ? <Dot tone="warning">Waiting for approval</Dot> : <Dot tone="muted">Not recorded</Dot>}
                {r.receiptUrl && <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex text-ink-faint hover:text-primary" aria-label="Receipt"><Paperclip className="size-3.5" /></a>}
              </td>
              <td className="px-2">{canDelete && <button onClick={() => remove(r)} className="grid size-8 place-items-center rounded-lg text-ink-faint hover:text-danger" aria-label="Delete fuel entry">{busyId === r.id ? <Spinner size="sm" /> : <Trash2 className="size-4" />}</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
