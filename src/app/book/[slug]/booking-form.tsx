"use client";

import { useMemo, useState, useTransition } from "react";
import { requestFacilityBooking } from "@/app/actions/bookings-public";

type Facility = { id: string; name: string; capacity: number | null; location: string | null; description: string | null; imageUrl: string | null; rate: number | null };
type Busy = { facilityId: string; start: string; end: string };

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const field = "w-full rounded-xl border border-[#e5e0db] bg-white px-4 py-3 text-sm text-[#1c1a16] shadow-sm outline-none focus:ring-2";

export function BookingRequestForm({ churchSlug, accent, facilities, busy }: { churchSlug: string; accent: string; facilities: Facility[]; busy: Busy[] }) {
  const [facilityId, setFacilityId] = useState(facilities.length === 1 ? facilities[0].id : "");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const selected = facilities.find((f) => f.id === facilityId);
  const taken = useMemo(() => busy.filter((b) => b.facilityId === facilityId).slice(0, 8), [busy, facilityId]);
  const ring = { "--tw-ring-color": accent } as React.CSSProperties;

  if (done) {
    return (
      <div className="rounded-2xl border border-[#e5e0db] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full text-2xl text-white" style={{ backgroundColor: accent }}>✓</div>
        <h2 className="font-display text-2xl font-bold text-[#1c1a16]">Request sent</h2>
        <p className="mt-2 text-sm text-[#6b6560]">Thank you. The church will review your request and get back to you by phone or text.</p>
      </div>
    );
  }

  const submit = (fd: FormData) => {
    setError("");
    fd.set("churchSlug", churchSlug);
    fd.set("facilityId", facilityId);
    start(async () => {
      const res = await requestFacilityBooking(fd);
      if (res.ok) setDone(true);
      else setError(res.error);
    });
  };

  return (
    <form action={submit} className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-medium text-[#1c1a16]">1. Choose a space</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {facilities.map((f) => {
            const on = f.id === facilityId;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFacilityId(f.id)}
                aria-pressed={on}
                className="overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition"
                style={{ borderColor: on ? accent : "#e5e0db", boxShadow: on ? `0 0 0 2px ${accent}` : undefined }}
              >
                {f.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.imageUrl} alt={f.name} className="h-32 w-full object-cover" />
                )}
                <div className="p-3.5">
                  <div className="font-semibold text-[#1c1a16]">{f.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[#6b6560]">
                    {f.capacity ? <span>Up to {f.capacity} people</span> : null}
                    {f.location ? <span>{f.location}</span> : null}
                    {f.rate ? <span>From GH₵{f.rate.toLocaleString()}</span> : null}
                  </div>
                  {f.description && <p className="mt-1.5 line-clamp-3 text-xs text-[#6b6560]">{f.description}</p>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-[#e5e0db] bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-[#1c1a16]">2. When do you need it?</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-[#6b6560]">Start</label>
            <input name="startTime" type="datetime-local" required className={field} style={ring} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#6b6560]">End</label>
            <input name="endTime" type="datetime-local" required className={field} style={ring} />
          </div>
        </div>
        {selected && taken.length > 0 && (
          <div className="rounded-xl bg-[#faf8f4] p-3 text-xs text-[#6b6560]">
            <span className="font-medium text-[#1c1a16]">{selected.name} is already booked:</span>
            <ul className="mt-1 space-y-0.5">{taken.map((b, i) => <li key={i}>{fmt(b.start)} to {fmt(b.end)}</li>)}</ul>
          </div>
        )}

        <p className="pt-2 text-sm font-medium text-[#1c1a16]">3. About you</p>
        <div>
          <label className="mb-1 block text-xs text-[#6b6560]">What is it for? *</label>
          <input name="purpose" required placeholder="e.g. Wedding reception, funeral, workshop" className={field} style={ring} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-[#6b6560]">Your name *</label>
            <input name="name" required autoComplete="name" className={field} style={ring} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#6b6560]">Phone number *</label>
            <input name="phone" required type="tel" autoComplete="tel" placeholder="024 000 0000" className={field} style={ring} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-[#6b6560]">Email (optional)</label>
          <input name="email" type="email" autoComplete="email" className={field} style={ring} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[#6b6560]">Anything else we should know? (optional)</label>
          <textarea name="notes" rows={3} placeholder="Number of guests, setup you need, sound system…" className={field} style={ring} />
        </div>
        {/* Honeypot - people never see this. */}
        <input name="website" tabIndex={-1} autoComplete="off" className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={pending || !facilityId}
        className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-md transition disabled:opacity-60"
        style={{ backgroundColor: accent }}
      >
        {pending && <span className="inline-block size-4 rounded-full border-2 border-white/30 border-t-white" style={{ animation: "spin 0.6s linear infinite" }} />}
        {pending ? "Sending your request..." : facilityId ? "Send booking request" : "Choose a space first"}
      </button>
      <p className="text-center text-xs text-[#a09890]">This is a request, not a confirmed booking. The church will reply to you.</p>
    </form>
  );
}
