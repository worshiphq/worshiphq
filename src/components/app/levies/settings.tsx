"use client";

import { useState } from "react";
import { BellRing, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { saveLevySettings } from "@/app/actions/levies";
import type { LeviesPageData } from "@/lib/levies/view-types";
import { cn } from "@/lib/utils";
import { BusyButton, useLevyAction } from "./shared";

const DAY_CHIPS = [14, 7, 3, 1];

function Toggle({ on, onChange, title, text, disabled }: { on: boolean; onChange: (v: boolean) => void; title: string; text: string; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-line p-3.5", disabled && "opacity-60")}>
      <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-ink-muted">{text}</span></span>
      <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]" />
    </label>
  );
}

export function SettingsView({ data }: { data: LeviesPageData }) {
  const { pending, run } = useLevyAction();
  const [s, setS] = useState(data.settings);
  const can = data.access.manage;
  const toggleDay = (d: number) => setS((p) => ({ ...p, remindDays: p.remindDays.includes(d) ? p.remindDays.filter((x) => x !== d) : [...p.remindDays, d].sort((a, b) => b - a) }));
  const toggleUser = (id: string) => setS((p) => ({ ...p, remindUserIds: p.remindUserIds.includes(id) ? p.remindUserIds.filter((x) => x !== id) : [...p.remindUserIds, id] }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3 p-5">
        <h3 className="flex items-center gap-2 font-display text-[1rem] font-semibold"><BellRing className="size-4 text-primary" /> Reminders</h3>
        <Toggle on={s.remindOn} disabled={!can} onChange={(v) => setS({ ...s, remindOn: v })} title="Remind us before a levy is due" text="An email to the people below, and one more the day after if it is missed." />
        {s.remindOn && (
          <>
            <div>
              <div className="mb-1.5 text-sm font-medium text-ink-muted">Remind us this many days before</div>
              <div className="flex flex-wrap gap-1.5">
                {DAY_CHIPS.map((d) => (
                  <button key={d} type="button" disabled={!can} onClick={() => toggleDay(d)} className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium", s.remindDays.includes(d) ? "border-primary bg-primary text-white" : "border-line text-ink-muted hover:bg-surface-2")}>{d} day{d === 1 ? "" : "s"}</button>
                ))}
              </div>
            </div>
            <Toggle on={s.remindSms} disabled={!can} onChange={(v) => setS({ ...s, remindSms: v })} title="Also send a text" text="Uses your church's SMS credits." />
            <div>
              <div className="mb-1.5 text-sm font-medium text-ink-muted">Who gets reminders</div>
              <p className="mb-2 text-xs text-ink-faint">{s.remindUserIds.length ? "Only the people ticked." : "Nobody ticked: the Main Admin, Admins and Finance get them."}</p>
              <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
                {data.team.map((u) => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                    <input type="checkbox" disabled={!can} checked={s.remindUserIds.includes(u.id)} onChange={() => toggleUser(u.id)} className="size-4 accent-[var(--color-primary)]" />
                    <span className="min-w-0 truncate">{u.name}</span><span className="ml-auto text-[11px] text-ink-faint">{u.role === "Owner" ? "Main Admin" : u.role}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>
      <Card className="space-y-3 p-5">
        <h3 className="flex items-center gap-2 font-display text-[1rem] font-semibold"><Lock className="size-4 text-primary" /> Closing periods</h3>
        <Toggle on={s.autoClose} disabled={!can} onChange={(v) => setS({ ...s, autoClose: v })} title="Close a period by itself once it is fully paid" text="A closed period keeps its figures even if giving for that month is changed later. You are told when that happens and choose what to do." />
        <p className="text-xs text-ink-muted">Times and due dates use your church&apos;s time zone ({data.tz}).</p>
        {can && (
          <BusyButton busy={pending} busyLabel="Saving settings..." onClick={() => run(() => saveLevySettings(s), "Levy settings saved.")}>Save settings</BusyButton>
        )}
      </Card>
    </div>
  );
}
