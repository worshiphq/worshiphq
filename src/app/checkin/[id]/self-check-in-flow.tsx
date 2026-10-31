"use client";

import { isValidPhone } from "@/lib/phone";
import { PhoneInput } from "@/components/ui/phone-input";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Search, UserPlus, ShieldCheck, ArrowLeft } from "lucide-react";
import { findForCheckIn, sendCheckInCode, completeCheckIn, checkInNewVisitor, type Candidate } from "@/app/actions/self-checkin";

type Step = "find" | "confirm" | "verify" | "new";

const inputCls = "h-12 w-full rounded-xl border border-[#e8e2d6] bg-white px-4 text-[1rem]/6 text-[#1c1a16] placeholder:text-[#a09888] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7377]/25";

/** This phone, remembered anonymously so a church can limit how many people one phone checks in. */
function deviceId(): string {
  try {
    let id = localStorage.getItem("whq_device");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("whq_device", id); }
    return id;
  } catch {
    return "";
  }
}

export function SelfCheckInFlow({ sessionId, accent, verify, geoOn }: { sessionId: string; accent: string; verify: "none" | "digits" | "sms"; geoOn: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("find");
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Candidate[] | null>(null);
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [where, setWhere] = useState<{ lat?: number; lng?: number; state: "idle" | "asking" | "ok" | "denied" }>({ state: geoOn ? "asking" : "idle" });
  const [nv, setNv] = useState({ firstName: "", lastName: "", phone: "", purpose: "" });
  const device = useRef("");

  useEffect(() => { device.current = deviceId(); }, []);

  // When the church only wants check-ins from near the church, ask for the phone's location up front.
  useEffect(() => {
    if (!geoOn) return;
    if (!("geolocation" in navigator)) { queueMicrotask(() => setWhere({ state: "denied" })); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setWhere({ lat: p.coords.latitude, lng: p.coords.longitude, state: "ok" }),
      () => setWhere({ state: "denied" }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, [geoOn]);

  const base = () => ({ sessionId, deviceId: device.current, lat: where.lat, lng: where.lng });
  const blocked = geoOn && where.state !== "ok";
  const fail = (m: string) => { setError(m); setBusy(false); };
  const done = (id: string) => router.push(`/checkin/${id}/done`);

  async function search() {
    setError("");
    if (query.trim().length < 3) { setError("Type at least 3 letters of your name, or your phone number."); return; }
    setBusy(true);
    const r = await findForCheckIn({ ...base(), query });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setPeople(r.people);
  }

  async function pick(c: Candidate) {
    setChosen(c); setDigits(""); setCode(""); setCodeSent(null); setError("");
    setStep("confirm");
  }

  async function confirmIsMe() {
    if (!chosen) return;
    setError("");
    if (verify === "none") {
      setBusy(true);
      const r = await completeCheckIn({ ...base(), personId: chosen.id });
      if (r.ok) return done(r.sessionId);
      return fail(r.error);
    }
    if (verify === "sms") {
      setBusy(true);
      const r = await sendCheckInCode({ ...base(), personId: chosen.id });
      setBusy(false);
      if (!r.ok) return setError(r.error);
      setCodeSent(r.sentTo);
    }
    setStep("verify");
  }

  async function submitVerify() {
    if (!chosen) return;
    setBusy(true); setError("");
    const r = await completeCheckIn({ ...base(), personId: chosen.id, digits, code });
    if (r.ok) return done(r.sessionId);
    fail(r.error);
  }

  async function submitNew() {
    setBusy(true); setError("");
    const r = await checkInNewVisitor({ ...base(), ...nv });
    if (r.ok) return done(r.sessionId);
    fail(r.error);
  }

  const btn = "flex h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-[1rem]/6 font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60";

  if (blocked) {
    return (
      <div className="rounded-2xl border border-[#e8e2d6] bg-white p-6 text-center shadow-sm">
        <MapPin className="mx-auto size-8" style={{ color: accent }} />
        {where.state === "asking" ? (
          <>
            <p className="mt-3 text-sm font-medium text-[#1c1a16]">Finding your location…</p>
            <p className="mt-1 text-xs text-[#6b6560]">Please tap Allow when your phone asks. We only use it to see that you are at church.</p>
            <Loader2 className="mx-auto mt-3 size-5 animate-spin text-[#6b6560]" />
          </>
        ) : (
          <>
            <p className="mt-3 text-sm font-medium text-[#1c1a16]">We need your location to check you in</p>
            <p className="mt-1 text-xs text-[#6b6560]">This church only allows check-in from the church. Allow location for this page in your browser settings, then try again, or ask an usher.</p>
            <button type="button" onClick={() => location.reload()} className={`${btn} mt-4`} style={{ backgroundColor: accent }}>Try again</button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[#e8e2d6] bg-white p-6 shadow-sm">
      {step === "find" && (
        <>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#6b6560]">Find yourself</label>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPeople(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }}
                placeholder="Your name or phone number"
                autoComplete="off"
                className={inputCls}
              />
              <button type="button" onClick={search} disabled={busy} aria-label="Search" className="grid size-12 shrink-0 place-items-center rounded-xl text-white disabled:opacity-60" style={{ backgroundColor: accent }}>
                {busy ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}
              </button>
            </div>
          </div>

          {people && people.length > 0 && (
            <ul className="divide-y divide-[#eee8dc] overflow-hidden rounded-xl border border-[#e8e2d6]">
              {people.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => pick(p)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#faf8f4]">
                    <span className="text-[1rem]/6 font-medium text-[#1c1a16]">{p.name}</span>
                    <span className="text-xs text-[#a09888]">{p.hint ?? ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {people && people.length === 0 && (
            <p className="rounded-xl bg-[#faf8f4] px-4 py-3 text-sm text-[#6b6560]">We could not find you. Check the spelling, try your phone number, or tell us you are new below.</p>
          )}

          <div className="relative py-1 text-center text-xs text-[#a09888]"><span className="relative z-10 bg-white px-3">or</span><span className="absolute inset-x-0 top-1/2 h-px bg-[#eee8dc]" /></div>
          <button type="button" onClick={() => { setStep("new"); setError(""); }} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#e8e2d6] text-[1rem]/6 font-medium text-[#1c1a16] hover:bg-[#faf8f4]">
            <UserPlus className="size-5" /> I am new here
          </button>
        </>
      )}

      {step === "confirm" && chosen && (
        <>
          <p className="text-center text-sm text-[#6b6560]">Is this you?</p>
          <p className="text-center font-display text-2xl font-bold text-[#1c1a16]">{chosen.name}</p>
          <button type="button" onClick={confirmIsMe} disabled={busy} className={btn} style={{ backgroundColor: accent }}>
            {busy ? <><Loader2 className="size-5 animate-spin" /> One moment…</> : "Yes, that is me"}
          </button>
          <button type="button" onClick={() => { setStep("find"); setChosen(null); setError(""); }} className="flex w-full items-center justify-center gap-1.5 text-sm text-[#6b6560] hover:text-[#1c1a16]"><ArrowLeft className="size-4" /> No, go back</button>
        </>
      )}

      {step === "verify" && chosen && (
        <>
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-[#1c1a16]"><ShieldCheck className="size-5" style={{ color: accent }} /> One quick check, {chosen.name}</div>
          {verify === "digits" ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#6b6560]">Last 3 digits of your phone number</label>
              <input value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="e.g. 567" autoFocus className={`${inputCls} text-center text-xl tracking-[0.4em]`} />
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#6b6560]">Enter the 6-digit code we texted to your {codeSent ?? "phone"}</label>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="123456" autoFocus className={`${inputCls} text-center text-xl tracking-[0.4em]`} />
            </div>
          )}
          <button type="button" onClick={submitVerify} disabled={busy || (verify === "digits" ? digits.length < 3 : code.length < 6)} className={btn} style={{ backgroundColor: accent }}>
            {busy ? <><Loader2 className="size-5 animate-spin" /> Checking in…</> : "Check me in"}
          </button>
          <button type="button" onClick={() => { setStep("find"); setChosen(null); setError(""); }} className="flex w-full items-center justify-center gap-1.5 text-sm text-[#6b6560] hover:text-[#1c1a16]"><ArrowLeft className="size-4" /> Not me</button>
        </>
      )}

      {step === "new" && (
        <>
          <p className="text-sm font-medium text-[#1c1a16]">Welcome! Tell us a little about you.</p>
          <div className="grid grid-cols-2 gap-2">
            <input value={nv.firstName} onChange={(e) => setNv({ ...nv, firstName: e.target.value })} placeholder="First name" autoComplete="given-name" className={inputCls} />
            <input value={nv.lastName} onChange={(e) => setNv({ ...nv, lastName: e.target.value })} placeholder="Last name" autoComplete="family-name" className={inputCls} />
          </div>
          <PhoneInput value={nv.phone} onChange={(v) => setNv((s) => ({ ...s, phone: v }))} aria-label="Phone number" />
          <input value={nv.purpose} onChange={(e) => setNv({ ...nv, purpose: e.target.value })} placeholder="What brings you here today? (optional)" className={inputCls} />
          <button type="button" onClick={submitNew} disabled={busy || !nv.firstName || !nv.lastName || !isValidPhone(nv.phone)} className={btn} style={{ backgroundColor: accent }}>
            {busy ? <><Loader2 className="size-5 animate-spin" /> Checking in…</> : "Check me in"}
          </button>
          <button type="button" onClick={() => { setStep("find"); setError(""); }} className="flex w-full items-center justify-center gap-1.5 text-sm text-[#6b6560] hover:text-[#1c1a16]"><ArrowLeft className="size-4" /> I have been here before</button>
        </>
      )}

      {error && <p className="rounded-xl bg-[#fdecea] px-4 py-3 text-sm text-[#a33a2f]">{error}</p>}
    </div>
  );
}
