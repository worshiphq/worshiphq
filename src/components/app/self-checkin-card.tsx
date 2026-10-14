"use client";

import { useEffect, useState } from "react";
import { QrCode, Loader2, Check, MapPin, ShieldCheck, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { getSelfCheckInRules, saveSelfCheckInRules, type SelfCheckInRules } from "@/app/actions/self-checkin";
import { cn } from "@/lib/utils";

const VERIFY = [
  { key: "none", title: "Name only", text: "They find their name and tap that it is them. Quickest, and the easiest to cheat." },
  { key: "digits", title: "Last 3 digits of their phone", text: "They also type the last 3 digits of the number you have for them. Free." },
  { key: "sms", title: "A code by SMS", text: "We text a 6-digit code to the number you have for them. Strongest, uses 1 SMS credit each." },
] as const;

/** Rules for QR self check-in: how people prove who they are, where they must be, and how many people one phone may check in. */
export function SelfCheckInCard({ canWrite, compact = false }: { canWrite: boolean; compact?: boolean }) {
  const { toast } = useFeedback();
  const [saved, setSaved] = useState<SelfCheckInRules | null>(null);
  const [r, setR] = useState<SelfCheckInRules | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [open, setOpen] = useState(!compact);

  useEffect(() => {
    let live = true;
    void getSelfCheckInRules().then((x) => { if (live) { setSaved(x); setR(x); } });
    return () => { live = false; };
  }, []);

  if (!r || !saved) return <Card className="flex items-center gap-2 p-5 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Loading…</Card>;

  const dirty = JSON.stringify(r) !== JSON.stringify(saved);
  const set = (patch: Partial<SelfCheckInRules>) => setR({ ...r, ...patch });
  const summary = [VERIFY.find((v) => v.key === saved.verify)?.title, saved.geoOn ? "location check on" : null, saved.deviceLimit ? `${saved.deviceLimit} per phone` : null].filter(Boolean).join(" · ");

  function useHere() {
    if (!("geolocation" in navigator)) { toast("This device cannot share its location.", "error"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); set({ geoLat: Math.round(p.coords.latitude * 1e6) / 1e6, geoLng: Math.round(p.coords.longitude * 1e6) / 1e6 }); toast("Church location set to where you are now. Save to keep it.", "success"); },
      () => { setLocating(false); toast("We could not get your location. Allow location for this site and try again.", "error"); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function save() {
    setBusy(true);
    const res = await saveSelfCheckInRules(r!);
    setBusy(false);
    if (res.ok) { setSaved(r); toast("Saved. The QR check-in page follows these rules now.", "success"); }
    else toast(res.error, "error");
  }

  if (!open) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <QrCode className="size-4 text-primary" />
          <span className="font-medium">QR check-in rules</span>
          <span className="text-xs text-ink-muted">{summary}</span>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Change</Button>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><QrCode className="size-5" /></div>
        <div>
          <h3 className="font-display text-lg font-semibold">QR check-in rules</h3>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-muted">
            People scan the QR code, find their name (or say they are new), and check themselves in. Choose how strict it should be.
            Visitors who have been before are found too, and can be welcomed back after the service.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="size-4 text-primary" /> How do they prove it is them?</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {VERIFY.map((v) => (
              <button
                key={v.key}
                type="button"
                disabled={!canWrite}
                onClick={() => set({ verify: v.key })}
                className={cn("rounded-xl border p-3 text-left transition-colors", r.verify === v.key ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-line hover:bg-surface-2")}
              >
                <div className="text-sm font-semibold">{v.title}</div>
                <div className="mt-1 text-xs text-ink-muted">{v.text}</div>
              </button>
            ))}
          </div>
          {r.verify !== "none" && <p className="mt-2 text-xs text-ink-faint">Members with no phone number on file are asked to see an usher, since there is nothing to check against.</p>}
        </div>

        <div className="rounded-xl border border-line p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={r.geoOn} onChange={(e) => set({ geoOn: e.target.checked })} disabled={!canWrite} className="mt-0.5 size-4 accent-primary" />
            <span className="text-sm">
              <span className="flex items-center gap-1.5 font-semibold"><MapPin className="size-4 text-primary" /> Only allow check-in at the church</span>
              <span className="mt-0.5 block text-xs text-ink-muted">Their phone shares its location when they check in, and it must be near the church. Stops people checking in from home with a forwarded link.</span>
            </span>
          </label>
          {r.geoOn && (
            <div className="mt-3 space-y-3 border-t border-line pt-3">
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="secondary" onClick={useHere} disabled={!canWrite || locating}>
                  {locating ? <><Loader2 className="size-4 animate-spin" /> Finding…</> : <><MapPin className="size-4" /> Use where I am now as the church</>}
                </Button>
                <span className="text-xs text-ink-muted">{r.geoLat != null ? `Church location set (${r.geoLat.toFixed(4)}, ${r.geoLng?.toFixed(4)})` : "Do this while you are standing at the church."}</span>
              </div>
              <label className="block text-xs font-medium text-ink-muted">How close must they be
                <select value={r.geoRadius} onChange={(e) => set({ geoRadius: Number(e.target.value) })} disabled={!canWrite} className="mt-1 block h-9 rounded-lg border border-line bg-surface px-2 text-sm">
                  {[100, 250, 500, 1000].map((m) => <option key={m} value={m}>Within {m} metres</option>)}
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line p-4">
          <div className="flex items-center gap-1.5 text-sm font-semibold"><Smartphone className="size-4 text-primary" /> How many people can one phone check in?</div>
          <p className="mt-0.5 text-xs text-ink-muted">Stops one person typing in lots of names. A family sharing a phone may need 2 to 4.</p>
          <select value={r.deviceLimit} onChange={(e) => set({ deviceLimit: Number(e.target.value) })} disabled={!canWrite} className="mt-2 block h-9 rounded-lg border border-line bg-surface px-2 text-sm">
            <option value={0}>No limit</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 1 ? "Just 1 person per service" : `Up to ${n} people per service`}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={save} disabled={!canWrite || busy || !dirty}>
          {busy ? <><Loader2 className="animate-spin" /> Saving…</> : <><Check /> Save</>}
        </Button>
        {compact && <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>}
      </div>
    </Card>
  );
}
