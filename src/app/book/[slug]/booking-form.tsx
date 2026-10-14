"use client";

import { useMemo, useState, useTransition } from "react";
import { requestFacilityBooking } from "@/app/actions/bookings-public";
import { MemberFormFields, type SpecialRender } from "@/components/app/member-form-fields";
import { priceFor, rateUnitLabel, type RateUnit } from "@/lib/bookings/pricing";
import type { FormField } from "@/lib/forms/registration";

type Facility = { id: string; name: string; capacity: number | null; location: string | null; description: string | null; imageUrl: string | null; rate: number | null; rateUnit: RateUnit };
type Busy = { facilityId: string; start: string; end: string };

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const field = "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";
const money = (n: number) => `GH₵${n.toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

export function BookingRequestForm({
  churchSlug, accent, facilities, busy, fields, today,
}: { churchSlug: string; accent: string; facilities: Facility[]; busy: Busy[]; fields: FormField[]; today: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full text-2xl text-white" style={{ backgroundColor: accent }}>✓</div>
        <h2 className="font-display text-2xl font-bold text-ink">Request sent</h2>
        <p className="mt-2 text-sm text-ink-muted">Thank you. The church will review your request and get back to you by phone or text.</p>
      </div>
    );
  }

  const special: Record<string, SpecialRender> = {
    facility: ({ value, setValue }) => (
      <div>
        {/* A real input so the browser can insist a space is chosen before moving on. */}
        <input tabIndex={-1} required value={value} onChange={() => {}} aria-hidden className="pointer-events-none absolute h-0 w-0 opacity-0" />
        <input type="hidden" name="facilityId" value={value} />
        <div className="grid gap-3 sm:grid-cols-2">
          {facilities.map((f) => {
            const on = f.id === value;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setValue(f.id)}
                aria-pressed={on}
                className="overflow-hidden rounded-2xl border bg-surface text-left shadow-sm transition"
                style={{ borderColor: on ? accent : undefined, boxShadow: on ? `0 0 0 2px ${accent}` : undefined }}
              >
                {f.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.imageUrl} alt={f.name} className="h-32 w-full object-cover" />
                )}
                <div className="p-3.5">
                  <div className="font-semibold text-ink">{f.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-muted">
                    {f.capacity ? <span>Up to {f.capacity} people</span> : null}
                    {f.location ? <span>{f.location}</span> : null}
                    {f.rate ? <span>{money(f.rate)} {rateUnitLabel(f.rateUnit)}</span> : null}
                  </div>
                  {f.description && <p className="mt-1.5 line-clamp-3 text-xs text-ink-muted">{f.description}</p>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    ),
    when: ({ values }) => <When facility={facilities.find((f) => f.id === values.facility)} busy={busy} today={today} accent={accent} />,
  };

  const submit = (fd: FormData) => {
    setError("");
    fd.set("churchSlug", churchSlug);
    start(async () => {
      const res = await requestFacilityBooking(fd);
      if (res.ok) setDone(true);
      else setError(res.error);
    });
  };

  return (
    <form action={submit} className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-7">
      <MemberFormFields
        fields={fields}
        departments={[]}
        stepped
        accent={accent}
        special={special}
        finalSlot={
          <div className="space-y-3">
            {/* Honeypot: people never see this. */}
            <input name="website" tabIndex={-1} autoComplete="off" className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />
            {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-md transition disabled:opacity-60"
              style={{ backgroundColor: accent }}
            >
              {pending && <span className="inline-block size-4 rounded-full border-2 border-white/30 border-t-white" style={{ animation: "spin 0.6s linear infinite" }} />}
              {pending ? "Sending your request..." : "Send booking request"}
            </button>
            <p className="text-center text-xs text-ink-faint">This is a request, not a confirmed booking. The church will reply to you.</p>
          </div>
        }
      />
    </form>
  );
}

/** Dates and times, with a live price when the space has one. One day by default; tick the box for several. */
function When({ facility, busy, today, accent }: { facility?: Facility; busy: Busy[]; today: string; accent: string }) {
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [multi, setMulti] = useState(false);
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");

  const needEndTime = facility?.rateUnit === "hour";
  const taken = useMemo(() => (facility ? busy.filter((b) => b.facilityId === facility.id).slice(0, 8) : []), [busy, facility]);

  const price = startDate && facility?.rate
    ? priceFor({ unit: facility.rateUnit, rate: facility.rate, startDate, startTime, endDate: multi ? endDate : undefined, endTime })
    : null;

  return (
    <div className="space-y-3">
      {!facility && <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-muted">Choose a space in the step before to see its price.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">{multi ? "First day" : "Day"} *</label>
          <input name="startDate" type="date" required min={today} value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate && e.target.value > endDate) setEndDate(e.target.value); }} className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Start time *</label>
          <input name="startTime" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className={field} />
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={multi} onChange={(e) => { setMulti(e.target.checked); if (!e.target.checked) setEndDate(""); }} className="size-4 rounded border-line accent-primary" />
        It runs over more than one day
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        {multi && (
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Last day *</label>
            <input name="endDate" type="date" required min={startDate || today} value={endDate} onChange={(e) => setEndDate(e.target.value)} className={field} />
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-ink-muted">End time {needEndTime ? "*" : "(optional)"}</label>
          <input name="endTime" type="time" required={needEndTime} value={endTime} onChange={(e) => setEndTime(e.target.value)} className={field} />
        </div>
      </div>

      {price && price.amount != null && (
        <div className="rounded-xl border p-3.5 text-sm" style={{ borderColor: accent, backgroundColor: `${accent}12` }}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium text-ink">Estimated price</span>
            <span className="font-display text-xl font-bold text-ink">{money(price.amount)}</span>
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">{price.detail}. The church confirms the final amount.</p>
        </div>
      )}
      {price && price.amount == null && facility?.rate && (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-muted">Add an end time to see the price ({money(facility.rate)} {rateUnitLabel(facility.rateUnit)}).</p>
      )}

      {facility && taken.length > 0 && (
        <div className="rounded-xl bg-surface-2 p-3 text-xs text-ink-muted">
          <span className="font-medium text-ink">{facility.name} is already booked:</span>
          <ul className="mt-1 space-y-0.5">{taken.map((b, i) => <li key={i}>{fmt(b.start)} to {fmt(b.end)}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
