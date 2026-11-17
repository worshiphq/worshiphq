"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bus } from "lucide-react";
import { saveAssetAlerts } from "@/app/actions/asset-alerts";
import { useFeedback } from "@/components/ui/feedback";
import { BusyButton, FormError } from "@/components/app/shared/kit";
import { cn } from "@/lib/utils";

const DAY_CHOICES = [60, 30, 14, 7, 3, 1];

/** Settings for the daily vehicles and equipment alert: on or off, who gets it, SMS too, and how many days before. */
export function AssetAlertsCard({ initial, team, canWrite }: {
  initial: { on: boolean; userIds: string[]; sms: boolean; days: number[] };
  team: { id: string; name: string; role: string; hasPhone: boolean }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const toggleUser = (id: string) => setS((x) => ({ ...x, userIds: x.userIds.includes(id) ? x.userIds.filter((u) => u !== id) : [...x.userIds, id] }));
  const toggleDay = (d: number) => setS((x) => ({ ...x, days: x.days.includes(d) ? x.days.filter((y) => y !== d) : [...x.days, d] }));

  const save = () => {
    setError("");
    const fd = new FormData();
    if (s.on) fd.set("on", "1");
    if (s.sms) fd.set("sms", "1");
    for (const u of s.userIds) fd.append("userIds", u);
    for (const d of [...s.days, 0]) fd.append("days", String(d));
    start(async () => {
      const r = await saveAssetAlerts(fd);
      if (r.ok) { toast("Alert settings saved", "success"); router.refresh(); } else setError(r.error ?? "That did not save.");
    });
  };

  return (
    <div className="mb-6 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft/50 text-primary"><Bus className="size-5" /></div>
          <div>
            <h2 className="font-display text-lg font-semibold">Vehicles and equipment alerts</h2>
            <p className="mt-0.5 max-w-xl text-sm text-ink-muted">One message each morning when insurance, roadworthy, DVLA renewal or a driver&apos;s licence is running out, a service is due, a warranty ends, a loan is late or an urgent fault is still open.</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={s.on} disabled={!canWrite} onChange={(e) => setS({ ...s, on: e.target.checked })} className="size-5 accent-[var(--color-primary)]" /> {s.on ? "On" : "Off"}
        </label>
      </div>
      {s.on && (
        <div className="mt-4 space-y-4 border-t border-line-soft pt-4">
          <div>
            <p className="text-sm font-medium">Who gets it</p>
            <p className="text-xs text-ink-muted">Nobody ticked means the Main Admin, Admins and Pastors.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {team.map((u) => (
                <button key={u.id} type="button" disabled={!canWrite} onClick={() => toggleUser(u.id)} aria-pressed={s.userIds.includes(u.id)}
                  className={cn("rounded-full border px-3 py-1 text-sm", s.userIds.includes(u.id) ? "border-primary bg-primary-soft/50 text-primary" : "border-line text-ink-muted hover:text-ink")}>
                  {u.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">Warn this many days before papers run out</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DAY_CHOICES.map((d) => (
                <button key={d} type="button" disabled={!canWrite} onClick={() => toggleDay(d)} aria-pressed={s.days.includes(d)}
                  className={cn("rounded-full border px-3 py-1 text-sm tabular-nums", s.days.includes(d) ? "border-primary bg-primary-soft/50 text-primary" : "border-line text-ink-muted hover:text-ink")}>
                  {d} day{d === 1 ? "" : "s"}
                </button>
              ))}
              <span className="self-center text-xs text-ink-faint">and on the day</span>
            </div>
          </div>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={s.sms} disabled={!canWrite} onChange={(e) => setS({ ...s, sms: e.target.checked })} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
            <span><span className="font-medium">Also send a short text</span><span className="block text-xs text-ink-muted">Email always goes. A text uses 1 SMS credit per person, only on days with something to say.</span></span>
          </label>
          <FormError error={error} />
          {canWrite && <BusyButton type="button" busy={pending} disabled={!dirty} onClick={save}>Save alert settings</BusyButton>}
        </div>
      )}
      {!s.on && canWrite && dirty && <div className="mt-3"><BusyButton type="button" busy={pending} onClick={save}>Save</BusyButton></div>}
    </div>
  );
}
