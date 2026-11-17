"use client";

import { useState } from "react";
import Link from "next/link";
import { Bus, Fuel, Plus, Route, Wrench, Gauge, AlertTriangle, Flag, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { Dot, type Tone } from "@/components/app/shared/kit";
import { Plate } from "@/components/app/vehicles/plate";
import { VehicleForm } from "@/components/app/vehicles/vehicle-form";
import { StartTripSheet, EndTripSheet, purposeLabel } from "@/components/app/vehicles/trip-sheet";
import { FuelSheet } from "@/components/app/vehicles/fuel-form";
import { LogServiceSheet, type Account } from "@/components/app/vehicles/service-form";
import type { VehicleCard } from "@/lib/data/fleet";
import type { DueState } from "@/lib/fleet/due";
import { cn } from "@/lib/utils";

export const dueTone = (s: DueState): Tone => (s === "overdue" ? "danger" : s === "soon" ? "warning" : s === "ok" ? "success" : "muted");
export const paperWords = (p: { state: DueState; days: number | null }) =>
  p.state === "unset" ? "Not recorded" : p.state === "overdue" ? `Ran out ${-p.days!} day${p.days === -1 ? "" : "s"} ago` : p.days === 0 ? "Ends today" : `${p.days} day${p.days === 1 ? "" : "s"} left`;
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).replace(" ", "");

type Due = { vehicleId: string; text: string; state: DueState; kind: string };

export function FleetClient({ cards, due, accounts, canWrite, canPostExpenses }: { cards: VehicleCard[]; due: Due[]; accounts: Account[]; canWrite: boolean; canPostExpenses: boolean }) {
  const [dialog, setDialog] = useState<null | { kind: "add" } | { kind: "papers"; id: string } | { kind: "trip"; id?: string } | { kind: "end"; id: string } | { kind: "fuel"; id?: string } | { kind: "service"; id: string }>(null);
  const close = () => setDialog(null);
  const fleet = cards.map((c) => ({ id: c.id, regNumber: c.regNumber, name: c.name, odometerKm: c.odometerKm, drivers: c.drivers, openTrip: c.openTrip, active: c.active }));
  const target = (id?: string) => cards.find((c) => c.id === id);
  const onRoad = cards.filter((c) => c.openTrip).length;

  return (
    <div>
      <PageHeader title="Vehicles" description={cards.length ? `${cards.length} vehicle${cards.length === 1 ? "" : "s"}${onRoad ? ` · ${onRoad} on the road now` : ""}` : "Church buses and cars: trips, fuel, papers and servicing."}>
        {cards.length > 0 && <a href="/api/export/vehicle-trips" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}><Download /> Trips</a>}
        {canWrite && cards.length > 0 && (
          <>
            <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: "trip" })}><Route /> Start a trip</Button>
            <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: "fuel" })}><Fuel /> Log fuel</Button>
          </>
        )}
        {canWrite && <Button size="sm" onClick={() => setDialog({ kind: "add" })}><Plus /> Add vehicle</Button>}
      </PageHeader>

      {due.length > 0 && (
        <Card className="mb-4 border-warning/30 p-0">
          <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-warning"><AlertTriangle className="size-3.5" /> Due soon</div>
          <ul className="divide-y divide-line-soft">
            {due.slice(0, 8).map((d, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Dot tone={dueTone(d.state)} className="shrink-0"><span className="sr-only">{d.state}</span></Dot>
                <span className="min-w-0 flex-1">{d.text}</span>
                {canWrite && ["insurance", "roadworthy", "registration"].includes(d.kind) && <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "papers", id: d.vehicleId })}>Renew</Button>}
                {canWrite && d.kind === "service" && <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "service", id: d.vehicleId })}>Log service</Button>}
                {d.kind === "licence" && <Link href={`/app/vehicles/${d.vehicleId}`} className="text-xs font-medium text-primary">Open</Link>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {cards.length === 0 ? (
        <Card className="p-8 text-center">
          <Bus className="mx-auto size-10 text-ink-faint" />
          <h2 className="mt-3 font-display text-lg font-bold">No vehicles yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">Add the church bus to log trips and fuel, and get a reminder before the insurance, roadworthy or DVLA renewal runs out.</p>
          {canWrite && <Button className="mt-4" onClick={() => setDialog({ kind: "add" })}><Plus /> Add vehicle</Button>}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => <VehicleTile key={c.id} c={c} canWrite={canWrite} onTrip={() => setDialog(c.openTrip ? { kind: "end", id: c.id } : { kind: "trip", id: c.id })} onFuel={() => setDialog({ kind: "fuel", id: c.id })} onService={() => setDialog({ kind: "service", id: c.id })} />)}
        </div>
      )}

      {dialog?.kind === "add" && <VehicleForm onClose={close} />}
      {dialog?.kind === "papers" && target(dialog.id) && <PapersFromCard card={target(dialog.id)!} onClose={close} />}
      {dialog?.kind === "trip" && <StartTripSheet vehicles={fleet} vehicleId={dialog.id} onClose={close} />}
      {dialog?.kind === "end" && target(dialog.id)?.openTrip && <EndTripSheet tripId={target(dialog.id)!.openTrip!.id} regNumber={target(dialog.id)!.regNumber} odometerStart={target(dialog.id)!.openTrip!.odometerStart} onClose={close} />}
      {dialog?.kind === "fuel" && <FuelSheet vehicles={cards} vehicleId={dialog.id} accounts={accounts} canPostExpenses={canPostExpenses} onClose={close} />}
      {dialog?.kind === "service" && target(dialog.id) && <LogServiceSheet assetId={target(dialog.id)!.assetId} isVehicle odometerKm={target(dialog.id)!.odometerKm} schedules={[]} accounts={accounts} canPostExpenses={canPostExpenses} onClose={close} />}
    </div>
  );
}

/** The Renew button: the vehicle form showing only its papers (saved with saveVehiclePapers, so nothing else is touched). */
function PapersFromCard({ card, onClose }: { card: VehicleCard; onClose: () => void }) {
  const p = (k: string) => card.papers.find((x) => x.key === k)?.date ?? null;
  return (
    <VehicleForm focus="papers" onClose={onClose} vehicle={{
      id: card.id, name: card.name, regNumber: card.regNumber, make: card.make, model: card.model, year: card.year, colour: null, kind: card.kind,
      seats: card.seats, fuelType: card.fuelType, chassisNo: null, odometerKm: card.odometerKm, insurer: card.insurer, insurancePolicyNo: card.insurancePolicyNo, insuranceType: card.insuranceType,
      insuranceExpires: p("insurance"), roadworthyExpires: p("roadworthy"), registrationExpires: p("registration"), notes: null, active: card.active,
      photoUrl: card.photoUrl, purchaseDate: null, purchasePrice: null,
    }} />
  );
}

function VehicleTile({ c, canWrite, onTrip, onFuel, onService }: { c: VehicleCard; canWrite: boolean; onTrip: () => void; onFuel: () => void; onService: () => void }) {
  const status = c.openTrip
    ? { tone: "info" as Tone, text: `On a trip${c.openTrip.driverName ? ` with ${c.openTrip.driverName}` : ""} since ${time(c.openTrip.startAt)} (${purposeLabel(c.openTrip.purpose)})` }
    : c.status === "in-repair" ? { tone: "warning" as Tone, text: "In repair" }
      : !c.active ? { tone: "muted" as Tone, text: "Parked (not in use)" }
        : { tone: "success" as Tone, text: "Available" };
  return (
    <Card className={cn("flex flex-col p-0", !c.active && "opacity-70")}>
      <Link href={`/app/vehicles/${c.id}`} className="block p-4 pb-3 hover:bg-surface-2/30">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Plate reg={c.regNumber} />
            <p className="mt-2 truncate text-sm font-semibold">{c.name}</p>
            <p className="text-xs text-ink-muted">{[c.make, c.model, c.year].filter(Boolean).join(" ") || "Make not recorded"}{c.seats ? ` · ${c.seats} seats` : ""}</p>
          </div>
          <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface-2 text-ink-faint">
            {c.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.photoUrl} alt="" loading="lazy" className="size-full object-cover" />
            ) : <Bus className="size-6" />}
          </span>
        </div>
        <p className="mt-3"><Dot tone={status.tone}>{status.text}</Dot></p>
        <ul className="mt-3 space-y-1 border-t border-line-soft pt-3">
          {c.papers.map((p) => (
            <li key={p.key} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-ink-muted">{p.label}</span>
              <Dot tone={dueTone(p.state)}>{paperWords(p)}</Dot>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1 tabular-nums"><Gauge className="size-3.5" /> {c.odometerKm.toLocaleString("en-GB")} km</span>
          {c.nextService && <span className={cn("inline-flex items-center gap-1", c.nextService.state === "overdue" ? "text-danger" : c.nextService.state === "soon" ? "text-warning" : "")}><Wrench className="size-3.5" /> {c.nextService.title} {c.nextService.reason}</span>}
        </p>
      </Link>
      {canWrite && c.active && (
        <div className="mt-auto grid grid-cols-3 border-t border-line text-sm">
          <button onClick={onTrip} className="flex items-center justify-center gap-1.5 py-2.5 font-medium text-primary hover:bg-surface-2">{c.openTrip ? <><Flag className="size-4" /> End trip</> : <><Route className="size-4" /> Start trip</>}</button>
          <button onClick={onFuel} className="flex items-center justify-center gap-1.5 border-x border-line py-2.5 font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"><Fuel className="size-4" /> Fuel</button>
          <button onClick={onService} className="flex items-center justify-center gap-1.5 py-2.5 font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"><Wrench className="size-4" /> Service</button>
        </div>
      )}
    </Card>
  );
}
