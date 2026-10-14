"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HeartHandshake, Loader2, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { getServiceThanks, saveServiceThanks, type ServiceThanksData } from "@/app/actions/service-thanks";
import { cn } from "@/lib/utils";

/**
 * "Thank you for coming": a warm text to every member who checked in, offered when a service is ended.
 * Off by default. Here the church chooses which services have it ticked by default; whether it is on or off,
 * whoever ends a service can still tick or untick it that day.
 */
export function ServiceThanksCard({ canWrite, compact = false }: { canWrite: boolean; compact?: boolean }) {
  const { toast } = useFeedback();
  const [data, setData] = useState<ServiceThanksData | null>(null);
  const [on, setOn] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [other, setOther] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(!compact);

  useEffect(() => {
    let live = true;
    void getServiceThanks().then((d) => {
      if (!live) return;
      setData(d); setOn(d.on); setNames(d.names); setOther(d.other);
    });
    return () => { live = false; };
  }, []);

  if (!data) {
    return <Card className="flex items-center gap-2 p-5 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Loading…</Card>;
  }

  const dirty = on !== data.on || other !== data.other || [...names].sort().join("|") !== [...data.names].sort().join("|");
  const toggle = (n: string) => setNames((cur) => (cur.some((x) => x.toLowerCase() === n.toLowerCase()) ? cur.filter((x) => x.toLowerCase() !== n.toLowerCase()) : [...cur, n]));

  // Switching on for the first time: tick Sunday services to begin with.
  const turnOn = (v: boolean) => {
    setOn(v);
    if (v && names.length === 0 && !other) setNames(data.services.filter((s) => s.day === "Sunday").map((s) => s.name));
  };

  async function save() {
    setBusy(true);
    const r = await saveServiceThanks({ on, names, other });
    setBusy(false);
    if (r.ok) {
      toast(on ? "Saved. Thank-you texts are ready when you end a service." : "Saved. This is switched off.", "success");
      setData({ ...data!, on, names, other });
    } else toast(r.error, "error");
  }

  // On the Attendance page it starts as a slim bar, so it is one tap away without taking over the page.
  if (!open) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-3 text-sm">
          <HeartHandshake className="size-4 text-primary" />
          <span className="font-medium">Thank members after service</span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", data.on ? "bg-success/10 text-success" : "bg-surface-2 text-ink-muted")}>
            {data.on ? (data.names.length ? `On for ${data.names.length} service${data.names.length === 1 ? "" : "s"}` : "On") : "Off"}
          </span>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{data.on ? "Change" : "Set up"}</Button>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><HeartHandshake className="size-5" /></div>
          <div>
            <h3 className="font-display text-lg font-semibold">Thank members after service</h3>
            <p className="mt-0.5 max-w-2xl text-sm text-ink-muted">
              When you end a service, every member who checked in and has a phone number can get a warm text, for example
              &ldquo;thank you for worshipping with us today, have a blessed week.&rdquo; Nobody is texted twice in a day. It is off by default and uses SMS credits.
            </p>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <span className={cn("relative h-6 w-11 rounded-full transition-colors", on ? "bg-primary" : "bg-line")}>
            <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[1.375rem]" : "left-0.5")} />
            <input type="checkbox" checked={on} onChange={(e) => turnOn(e.target.checked)} disabled={!canWrite} className="sr-only" />
          </span>
          {on ? "On" : "Off"}
        </label>
      </div>

      {on && (
        <div className="mt-4 rounded-xl border border-line p-4">
          <p className="text-sm font-medium">Tick it by default for</p>
          <p className="mt-0.5 text-xs text-ink-faint">Whoever ends a service can still tick or untick it on the day.</p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {data.services.length === 0 && <p className="text-xs text-ink-faint">Add your service times in Settings, or run a service, and they will appear here.</p>}
            {data.services.map((s) => (
              <label key={s.name} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                <input type="checkbox" checked={names.some((x) => x.toLowerCase() === s.name.toLowerCase())} onChange={() => toggle(s.name)} disabled={!canWrite} className="size-4 rounded border-line accent-primary" />
                <span>{s.name}{s.day && <span className="text-xs text-ink-faint"> · {s.day}</span>}</span>
              </label>
            ))}
            <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
              <input type="checkbox" checked={other} onChange={(e) => setOther(e.target.checked)} disabled={!canWrite} className="size-4 rounded border-line accent-primary" />
              <span>Other programs I start myself</span>
            </label>
          </div>
          <div className="mt-3 rounded-lg border border-dashed border-line bg-base p-3 text-sm">
            <span className="text-[10px] uppercase tracking-wide text-ink-faint">Each member gets</span>
            <p className="mt-1 text-ink">{data.sample}</p>
            <Link href="/app/messages?focus=service_thanks" className="mt-1 inline-block text-xs font-medium text-primary hover:underline">Edit the wording</Link>
          </div>
        </div>
      )}

      <div className="mt-4">
        <Button size="sm" onClick={save} disabled={!canWrite || busy || !dirty}>
          {busy ? <><Loader2 className="animate-spin" /> Saving…</> : <><Check /> Save</>}
        </Button>
      </div>
    </Card>
  );
}
