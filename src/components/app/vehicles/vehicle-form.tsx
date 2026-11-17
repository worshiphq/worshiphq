"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bus } from "lucide-react";
import { saveVehicle, saveVehiclePapers } from "@/app/actions/vehicles";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { PhotoInput } from "@/components/app/shared/photo-input";
import { Sheet, BusyButton, FormError, FormSection, F, Select, ChipChoice, ymdOf } from "@/components/app/shared/kit";
import { Plate } from "@/components/app/vehicles/plate";

export const VEHICLE_KIND_OPTIONS = [
  { value: "bus", label: "Bus" }, { value: "minibus", label: "Minibus" }, { value: "car", label: "Car" }, { value: "pickup", label: "Pickup" },
  { value: "van", label: "Van" }, { value: "motorbike", label: "Motorbike" }, { value: "other", label: "Other" },
];
export const FUEL_OPTIONS = [{ value: "diesel", label: "Diesel" }, { value: "petrol", label: "Petrol" }, { value: "lpg", label: "Gas (LPG)" }, { value: "electric", label: "Electric" }, { value: "hybrid", label: "Hybrid" }];

export type VehicleFormValue = {
  id: string; name: string; regNumber: string; make: string | null; model: string | null; year: number | null; colour: string | null; kind: string;
  seats: number | null; fuelType: string; chassisNo: string | null; odometerKm: number; insurer: string | null; insurancePolicyNo: string | null;
  insuranceType: string | null; insuranceExpires: string | null; roadworthyExpires: string | null; registrationExpires: string | null;
  notes: string | null; active: boolean; photoUrl: string | null; purchaseDate: string | null; purchasePrice: number | null;
};

/** Add or edit a vehicle. `focus="papers"` opens straight at the insurance and roadworthy dates (the Renew button). */
export function VehicleForm({ vehicle, focus, onClose }: { vehicle?: VehicleFormValue | null; focus?: "papers"; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [kind, setKind] = useState(vehicle?.kind ?? "bus");
  const [reg, setReg] = useState(vehicle?.regNumber ?? "");
  const papersOnly = focus === "papers" && !!vehicle;

  const submit = (fd: FormData) => {
    setError("");
    if (vehicle) fd.set("id", vehicle.id);
    fd.set("kind", kind);
    start(async () => {
      const r = papersOnly ? await saveVehiclePapers(fd) : await saveVehicle(fd);
      if (r.ok) {
        toast(vehicle ? "Vehicle saved" : "Vehicle added", "success");
        router.refresh();
        onClose();
        if (!vehicle && r.id) router.push(`/app/vehicles/${r.id}`);
      } else setError(r.error ?? "That did not save.");
    });
  };

  return (
    <Sheet open onClose={onClose} busy={pending} wide title={papersOnly ? `Papers for ${vehicle!.regNumber}` : vehicle ? `Edit ${vehicle.regNumber}` : "Add vehicle"}>
      <form action={submit} className="space-y-5">
        {!papersOnly && (
          <FormSection title="The vehicle">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <F label="Number plate" htmlFor="v-reg"><Input id="v-reg" name="regNumber" value={reg} onChange={(e) => setReg(e.target.value.toUpperCase())} placeholder="GR 1234-20" required autoCapitalize="characters" className="font-mono uppercase" /></F>
              {reg.trim().length >= 3 && <Plate reg={reg.trim()} className="justify-self-start" />}
            </div>
            <F label="Kind"><ChipChoice value={kind} onChange={setKind} options={VEHICLE_KIND_OPTIONS} /></F>
            <div className="grid gap-3 sm:grid-cols-3">
              <F label="Make" htmlFor="v-make"><Input id="v-make" name="make" defaultValue={vehicle?.make ?? ""} placeholder="Toyota" /></F>
              <F label="Model" htmlFor="v-model"><Input id="v-model" name="model" defaultValue={vehicle?.model ?? ""} placeholder="Coaster" /></F>
              <F label="Year" htmlFor="v-year"><Input id="v-year" name="year" type="number" inputMode="numeric" defaultValue={vehicle?.year ?? ""} placeholder="2018" /></F>
              <F label="Seats" htmlFor="v-seats"><Input id="v-seats" name="seats" type="number" inputMode="numeric" defaultValue={vehicle?.seats ?? ""} placeholder="30" /></F>
              <F label="Fuel" htmlFor="v-fuel"><Select id="v-fuel" name="fuelType" defaultValue={vehicle?.fuelType ?? "diesel"} options={FUEL_OPTIONS} /></F>
              <F label="Colour" htmlFor="v-col"><Input id="v-col" name="colour" defaultValue={vehicle?.colour ?? ""} placeholder="White" /></F>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Name people use" htmlFor="v-name" hint="Optional, for example Youth bus"><Input id="v-name" name="name" defaultValue={vehicle?.name ?? ""} /></F>
              <F label="Odometer now (km)" htmlFor="v-odo"><Input id="v-odo" name="odometerKm" type="number" inputMode="numeric" min={vehicle?.odometerKm ?? 0} defaultValue={vehicle?.odometerKm ?? ""} placeholder="0" /></F>
            </div>
            <PhotoInput name="photo" initial={vehicle?.photoUrl} label="Photo" icon={Bus} wide />
          </FormSection>
        )}

        <FormSection title="Papers" hint="You will be reminded before each of these runs out.">
          <div className="grid gap-3 sm:grid-cols-3">
            <F label="Insurance ends" htmlFor="v-ins"><Input id="v-ins" name="insuranceExpires" type="date" defaultValue={ymdOf(vehicle?.insuranceExpires)} /></F>
            <F label="Roadworthy ends" htmlFor="v-rw"><Input id="v-rw" name="roadworthyExpires" type="date" defaultValue={ymdOf(vehicle?.roadworthyExpires)} /></F>
            <F label="DVLA renewal due" htmlFor="v-reg2"><Input id="v-reg2" name="registrationExpires" type="date" defaultValue={ymdOf(vehicle?.registrationExpires)} /></F>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <F label="Insurer" htmlFor="v-insr"><Input id="v-insr" name="insurer" defaultValue={vehicle?.insurer ?? ""} placeholder="e.g. SIC" /></F>
            <F label="Policy number" htmlFor="v-pol"><Input id="v-pol" name="insurancePolicyNo" defaultValue={vehicle?.insurancePolicyNo ?? ""} /></F>
            <F label="Cover" htmlFor="v-cov"><Select id="v-cov" name="insuranceType" defaultValue={vehicle?.insuranceType ?? ""} options={[{ value: "", label: "Not set" }, { value: "comprehensive", label: "Comprehensive" }, { value: "third-party", label: "Third party" }]} /></F>
          </div>
        </FormSection>

        {!papersOnly && (
          <FormSection title="Purchase and notes">
            <div className="grid gap-3 sm:grid-cols-3">
              <F label="Bought on" htmlFor="v-pd"><Input id="v-pd" name="purchaseDate" type="date" defaultValue={ymdOf(vehicle?.purchaseDate)} /></F>
              <F label="Cost (₵)" htmlFor="v-pp"><Input id="v-pp" name="purchasePrice" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={vehicle?.purchasePrice ?? ""} /></F>
              <F label="Chassis number" htmlFor="v-ch"><Input id="v-ch" name="chassisNo" defaultValue={vehicle?.chassisNo ?? ""} className="font-mono" /></F>
            </div>
            <F label="Notes" htmlFor="v-notes"><Textarea id="v-notes" name="notes" rows={2} className="min-h-16" defaultValue={vehicle?.notes ?? ""} /></F>
            {vehicle && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" value="1" defaultChecked={vehicle.active} className="size-4 accent-[var(--color-primary)]" /> In use (untick for a vehicle that is parked for good)</label>
            )}
            {/* Sent after the box: an unticked box leaves only this empty value, which reads as "not in use". */}
            {vehicle && <input type="hidden" name="active" value="" />}
          </FormSection>
        )}

        <FormError error={error} />
        <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-line bg-surface px-4 pt-3 sm:static sm:mx-0 sm:border-0 sm:px-0">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <BusyButton busy={pending} className="flex-1">{papersOnly ? "Save dates" : "Save vehicle"}</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}
