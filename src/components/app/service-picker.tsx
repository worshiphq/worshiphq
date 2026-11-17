"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { loadServiceChoices } from "@/app/actions/giving";
import { NO_SERVICE, OTHER_SERVICE, defaultServiceChoice, pickFor, type ServiceChoice, type ServicePick } from "@/lib/service-income/choose";

const sel = "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";
const fmtTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const LAST_KEY = (ymd: string) => `whq:service-last:${ymd}`;

function readLast(ymd: string): string | null {
  try { return window.localStorage.getItem(LAST_KEY(ymd)); } catch { return null; }
}

/** Remember the service last used for a date on this device, so the next form on that date starts with it. */
export function rememberService(ymd: string, pick: ServicePick | null) {
  try { window.localStorage.setItem(LAST_KEY(ymd), pick?.name ?? NO_SERVICE); } catch { /* private window: fine */ }
}

/**
 * "Which service?" for the Giving forms. Offers the church's service times for that weekday, service records already
 * made that day and attendance taken that day, plus "Another service" and "Not linked to a service".
 * Returns the current pick (null = not linked) and the field to render.
 */
export function useServicePicker(date: string, opts: { prefer?: string | null; id?: string; hint?: string | false; label?: string } = {}) {
  const [got, setGot] = useState<{ date: string; choices: ServiceChoice[] } | null>(null);
  const [chosen, setChosen] = useState<{ date: string; key: string } | null>(null);
  const [other, setOther] = useState(opts.prefer ?? "");
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);

  useEffect(() => {
    if (!valid) return;
    let live = true;
    loadServiceChoices(date)
      .then((c) => { if (live) setGot({ date, choices: c }); })
      .catch(() => { if (live) setGot({ date, choices: [] }); });
    return () => { live = false; };
  }, [date, valid]);

  const choices = got?.date === date ? got.choices : null;
  const loading = valid && choices === null;
  let key: string = NO_SERVICE;
  if (chosen?.date === date) key = chosen.key;
  else if (choices) {
    key = defaultServiceChoice(choices, { prefer: opts.prefer, last: readLast(date) });
    // Opened for a service that is not offered that day: keep its name as "another service".
    if (key === NO_SERVICE && opts.prefer?.trim()) key = OTHER_SERVICE;
  }
  const pick = choices ? pickFor(choices, key, other) : null;
  const id = opts.id ?? "svc-pick";

  const field = (
    <div>
      <Label htmlFor={id}>{opts.label ?? "Which service?"}</Label>
      <div className="relative">
        <select id={id} value={key} disabled={loading} onChange={(e) => setChosen({ date, key: e.target.value })} className={sel}>
          {(choices ?? []).map((c) => <option key={c.key} value={c.key}>{c.name}{c.startMinute !== null ? ` (${fmtTime(c.startMinute)})` : ""}</option>)}
          <option value={OTHER_SERVICE}>Another service...</option>
          <option value={NO_SERVICE}>Not linked to a service</option>
        </select>
        {loading && <Loader2 className="pointer-events-none absolute right-8 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-faint" aria-label="Loading services" />}
      </div>
      {key === OTHER_SERVICE && (
        <Input className="mt-2" value={other} onChange={(e) => setOther(e.target.value)} placeholder="e.g. Sunday 2nd service" maxLength={80} aria-label="Service name" />
      )}
      {opts.hint !== false && <p className="mt-1 text-[11px] text-ink-faint">{opts.hint ?? "Service income then shows what each service brought in."}</p>}
    </div>
  );

  return { pick, field, loading, remember: () => rememberService(date, pick) };
}
