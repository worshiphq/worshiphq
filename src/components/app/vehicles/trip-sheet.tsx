"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startTrip, endTrip, logTrip } from "@/app/actions/vehicles";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { Sheet, BusyButton, FormError, F, Select, ChipChoice } from "@/components/app/shared/kit";
import { Plate } from "@/components/app/vehicles/plate";

export const PURPOSE_OPTIONS = [
  { value: "service-pickup", label: "Service pick-up" }, { value: "event", label: "Event" }, { value: "errand", label: "Errand" },
  { value: "outreach", label: "Outreach" }, { value: "funeral", label: "Funeral" }, { value: "other", label: "Other" },
];
export const purposeLabel = (k: string) => PURPOSE_OPTIONS.find((p) => p.value === k)?.label ?? k;

export type FleetVehicle = { id: string; regNumber: string; name: string; odometerKm: number; drivers: { id: string; name: string; isPrimary: boolean }[]; openTrip: { id: string } | null; active: boolean };

/** Start a trip (or, with `full`, record a whole trip after it happened). Built for the transport officer on a phone. */
export function StartTripSheet({ vehicles, vehicleId, full, onClose }: { vehicles: FleetVehicle[]; vehicleId?: string; full?: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const free = vehicles.filter((v) => v.active && (full || !v.openTrip));
  const [vid, setVid] = useState(vehicleId ?? free[0]?.id ?? "");
  const [purpose, setPurpose] = useState("service-pickup");
  const v = vehicles.find((x) => x.id === vid);
  const [driver, setDriver] = useState(v?.drivers.find((d) => d.isPrimary)?.id ?? v?.drivers[0]?.id ?? "");

  const submit = (fd: FormData) => {
    setError("");
    fd.set("vehicleId", vid);
    fd.set("purpose", purpose);
    fd.set("driverId", driver === "other" ? "" : driver);
    start(async () => {
      const r = full ? await logTrip(fd) : await startTrip(fd);
      if (r.ok) { toast(full ? "Trip saved" : "Trip started. Safe journey.", "success"); router.refresh(); onClose(); }
      else setError(r.error ?? "That did not save.");
    });
  };

  if (!free.length) {
    return (
      <Sheet open onClose={onClose} title="Start a trip">
        <p className="text-sm text-ink-muted">Every vehicle is already on a trip. End one first.</p>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} busy={pending} title={full ? "Record a past trip" : "Start a trip"}>
      <form action={submit} className="space-y-4">
        {free.length > 1 || !vehicleId ? (
          <F label="Vehicle">
            <div className="flex flex-wrap gap-2">
              {free.map((x) => (
                <button key={x.id} type="button" onClick={() => { setVid(x.id); setDriver(x.drivers.find((d) => d.isPrimary)?.id ?? x.drivers[0]?.id ?? ""); }}
                  className={`rounded-xl border p-2 ${vid === x.id ? "border-primary ring-2 ring-primary/30" : "border-line"}`} aria-pressed={vid === x.id}>
                  <Plate reg={x.regNumber} size="sm" />
                  <span className="mt-1 block text-left text-xs text-ink-muted">{x.name}</span>
                </button>
              ))}
            </div>
          </F>
        ) : v ? <Plate reg={v.regNumber} /> : null}
        <F label="What for"><ChipChoice value={purpose} onChange={setPurpose} options={PURPOSE_OPTIONS} /></F>
        <F label="Driver" htmlFor="t-dr">
          <Select id="t-dr" value={driver} onChange={setDriver} options={[...(v?.drivers ?? []).map((d) => ({ value: d.id, label: d.name })), { value: "other", label: "Someone else" }, ...(v?.drivers.length ? [] : [{ value: "", label: "Not set" }])]} />
        </F>
        {driver === "other" && <F label="Driver's name" htmlFor="t-dn"><Input id="t-dn" name="driverName" placeholder="Full name" /></F>}
        <F label="Going to" htmlFor="t-dest"><Input id="t-dest" name="destination" placeholder="e.g. Kasoa pick-up route" /></F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Odometer at start" htmlFor="t-os"><Input id="t-os" name="odometerStart" type="number" inputMode="numeric" min={v?.odometerKm ?? 0} placeholder={v ? String(v.odometerKm) : ""} /></F>
          {full && <F label="Odometer at end" htmlFor="t-oe"><Input id="t-oe" name="odometerEnd" type="number" inputMode="numeric" min="0" /></F>}
        </div>
        {full && (
          <div className="grid grid-cols-2 gap-3">
            <F label="Started" htmlFor="t-sa"><Input id="t-sa" name="startAt" type="datetime-local" /></F>
            <F label="Ended" htmlFor="t-ea"><Input id="t-ea" name="endAt" type="datetime-local" /></F>
            <F label="Passengers" htmlFor="t-px"><Input id="t-px" name="passengers" type="number" inputMode="numeric" min="0" /></F>
          </div>
        )}
        <FormError error={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <BusyButton busy={pending} busyLabel={full ? "Saving…" : "Starting…"} className="flex-1">{full ? "Save trip" : "Start trip"}</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}

export function EndTripSheet({ tripId, regNumber, odometerStart, onClose }: { tripId: string; regNumber: string; odometerStart: number | null; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const submit = (fd: FormData) => {
    setError("");
    fd.set("tripId", tripId);
    start(async () => {
      const r = await endTrip(fd);
      if (r.ok) { toast("Trip ended", "success"); router.refresh(); onClose(); }
      else setError(r.error ?? "That did not save.");
    });
  };
  return (
    <Sheet open onClose={onClose} busy={pending} title="End trip" description={regNumber}>
      <form action={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <F label="Odometer now" htmlFor="e-oe" hint={odometerStart != null ? `Started at ${odometerStart.toLocaleString("en-GB")} km` : undefined}><Input id="e-oe" name="odometerEnd" type="number" inputMode="numeric" min={odometerStart ?? 0} autoFocus /></F>
          <F label="Passengers" htmlFor="e-px"><Input id="e-px" name="passengers" type="number" inputMode="numeric" min="0" /></F>
        </div>
        <F label="Note" htmlFor="e-n"><Textarea id="e-n" name="note" rows={2} className="min-h-16" placeholder="Anything to report about the vehicle?" /></F>
        <FormError error={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <BusyButton busy={pending} busyLabel="Ending…" className="flex-1">End trip</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}
