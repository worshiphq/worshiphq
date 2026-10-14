"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Field } from "@/components/app/action-dialog";
import { DAYS_FULL, DEFAULT_MEETING_REMINDER, type ScheduleEntry, type DayRemind } from "@/lib/groups/meeting-reminder";
import { WEEKDAY_OPTIONS } from "@/lib/automations/weekdays";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";

export type GroupFormValues = {
  name: string;
  type: string;
  description: string | null;
  schedule: ScheduleEntry[];
  meetingDays: string[];
  meetingDay: string | null;
  meetingTime: string | null;
  location: string | null;
  leaderId: string | null;
  onForms: boolean;
  meetingReminderOn: boolean;
  meetingReminderAuto: boolean;
  meetingReminderLeadDays: number;
  meetingReminderHour: number;
  meetingReminderMinute: number;
  meetingReminderWeekday: number | null;
  meetingReminderText: string | null;
};

/** All group form inputs (shared by create + edit), with client state for the
 *  multi-day picker and the reminder settings. Rendered inside an ActionDialog
 *  <form>, so every input serialises straight into the server action. */
export function GroupFields({
  group,
  people,
  typeSuggestions,
}: {
  group?: Partial<GroupFormValues> | null;
  people: { id: string; name: string }[];
  typeSuggestions: string[];
}) {
  // Per-day schedule: initialise from meetingSchedule, else legacy days/day+time.
  const initialSchedule: ScheduleEntry[] =
    group?.schedule?.length
      ? group.schedule
      : group?.meetingDays?.length
        ? group.meetingDays.map((d) => ({ day: d, time: group?.meetingTime ?? null }))
        : group?.meetingDay
          ? [{ day: group.meetingDay, time: group?.meetingTime ?? null }]
          : [];
  const [schedule, setSchedule] = useState<ScheduleEntry[]>(initialSchedule);
  const [reminderOn, setReminderOn] = useState(group?.meetingReminderOn ?? false);
  const [mode, setMode] = useState<"auto" | "manual">(group?.meetingReminderAuto === false ? "manual" : "auto");
  // Auto timing: relative ("days before") vs absolute weekday ("on a day").
  const [whenMode, setWhenMode] = useState<"relative" | "weekday">(group?.meetingReminderWeekday != null ? "weekday" : "relative");
  const [leadDays, setLeadDays] = useState(group?.meetingReminderLeadDays ?? 0);
  const [remHour, setRemHour] = useState(group?.meetingReminderHour ?? 8);
  const [remMinute, setRemMinute] = useState(group?.meetingReminderMinute ?? 0);
  const [remWeekday, setRemWeekday] = useState(group?.meetingReminderWeekday ?? 1);
  const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  // Each meeting day can have its own reminder timing (e.g. Sunday the day before,
  // Wednesday that morning). Off = every day follows the default above.
  const [perDay, setPerDay] = useState(initialSchedule.some((s) => s.remind));

  const timeFor = (d: string) => schedule.find((s) => s.day === d)?.time ?? "";
  const toggleDay = (d: string) =>
    setSchedule((prev) => (prev.some((s) => s.day === d) ? prev.filter((s) => s.day !== d) : [...prev, { day: d, time: null }]));
  const setTime = (d: string, t: string) =>
    setSchedule((prev) => prev.map((s) => (s.day === d ? { ...s, time: t || null } : s)));
  const setRemind = (d: string, remind: DayRemind | undefined) =>
    setSchedule((prev) => prev.map((s) => {
      if (s.day !== d) return s;
      const { remind: _old, ...rest } = s;
      void _old;
      return remind ? { ...rest, remind } : rest;
    }));
  const customFor = (d: string) => schedule.find((s) => s.day === d)?.remind;

  // Serialise for the server action, ordered Sun→Sat.
  const scheduleJson = JSON.stringify(
    DAYS_FULL.map((d) => schedule.find((s) => s.day === d)).filter(Boolean).map((s) => ({
      day: s!.day,
      time: s!.time,
      ...(reminderOn && mode === "auto" && perDay && s!.remind ? { remind: s!.remind } : {}),
    })),
  );

  return (
    <>
      <input type="hidden" name="meetingSchedule" value={scheduleJson} />
      <Field label="Name" name="name" placeholder="e.g. Youth Fellowship" defaultValue={group?.name} required />
      <Field label="Type" name="type" suggestions={typeSuggestions} defaultValue={group?.type} hint="Pick one or type your own" />
      <Field label="Description" name="description" placeholder="Brief description..." defaultValue={group?.description ?? ""} />

      {/* Meeting days - pick any number, each with its own time */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-muted">Meeting days &amp; times</label>
        <div className="space-y-1.5">
          {DAYS_FULL.map((d) => {
            const on = schedule.some((s) => s.day === d);
            return (
              <div key={d} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={cn(
                    "w-20 shrink-0 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                    on ? "border-primary bg-primary/10 text-primary-bright" : "border-line text-ink-muted hover:bg-surface-2",
                  )}
                >
                  {d.slice(0, 3)}
                </button>
                {on ? (
                  <input
                    type="time"
                    value={timeFor(d)}
                    onChange={(e) => setTime(d, e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-line bg-surface px-2.5 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                  />
                ) : (
                  <span className="flex-1 text-xs text-ink-faint">Tap to add this day</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-ink-faint">Optional - pick each day the group meets and set its own time (leave a time blank if it varies).</p>
      </div>

      <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-line p-3">
        <span>
          <span className="block text-sm font-medium">Let people choose this group when they sign up</span>
          <span className="mt-0.5 block text-xs text-ink-faint">It appears as a choice on the member, teens and children forms (once you add the Groups question to the form). You can always add or remove people yourself.</span>
        </span>
        <input type="checkbox" name="onForms" defaultChecked={group?.onForms ?? false} className="mt-1 size-4 shrink-0 accent-primary" />
      </label>

      <Field label="Location" name="location" placeholder="e.g. Church hall room 3" defaultValue={group?.location ?? ""} />
      <Field
        label="Leader"
        name="leaderId"
        options={[{ label: "- No leader -", value: "" }, ...people.map((p) => ({ label: p.name, value: p.id }))]}
        defaultValue={group?.leaderId ?? ""}
        hint="Optional - some groups don’t have a leader"
      />

      {/* Meeting reminder */}
      <div className="rounded-xl border border-line p-3">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium"><Bell className="size-4 text-primary" /> Remind the group of meetings</span>
          <input type="checkbox" name="meetingReminderOn" checked={reminderOn} onChange={(e) => setReminderOn(e.target.checked)} className="size-4 accent-primary" />
        </label>

        {reminderOn && schedule.length === 0 && (
          <p className="mt-2 text-xs text-amber-600">Pick at least one meeting day above to send reminders.</p>
        )}

        {reminderOn && (
          <div className="mt-3 space-y-3">
            {/* Auto vs manual */}
            <input type="hidden" name="meetingReminderMode" value={mode} />
            <Segmented
              value={mode}
              onChange={setMode}
              options={[{ value: "auto", label: "Send automatically" }, { value: "manual", label: "Send manually" }]}
            />

            {mode === "auto" ? (
              <div className="space-y-2">
                {/* Days-before vs specific weekday */}
                <input type="hidden" name="meetingReminderLeadDays" value={leadDays} />
                <input type="hidden" name="meetingReminderHour" value={remHour} />
                <input type="hidden" name="meetingReminderMinute" value={remMinute} />
                <input type="hidden" name="meetingReminderWeekday" value={whenMode === "weekday" ? remWeekday : ""} />
                <Segmented
                  value={whenMode}
                  onChange={setWhenMode}
                  options={[{ value: "relative", label: "Days before" }, { value: "weekday", label: "On a day" }]}
                />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-ink-muted">Send</span>
                  {whenMode === "relative" ? (
                    <select value={leadDays} onChange={(e) => setLeadDays(Number(e.target.value))} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm">
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{d === 0 ? "on the day" : `${d} day${d === 1 ? "" : "s"} before`}</option>)}
                    </select>
                  ) : (
                    <select value={remWeekday} onChange={(e) => setRemWeekday(Number(e.target.value))} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm">
                      {WEEKDAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}s</option>)}
                    </select>
                  )}
                  <span className="text-ink-muted">at</span>
                  <input type="time" value={hhmm(remHour, remMinute)}
                    onChange={(e) => { const m = /^(\d{1,2}):(\d{2})$/.exec(e.target.value); if (m) { setRemHour(Math.min(23, +m[1])); setRemMinute(Math.min(59, +m[2])); } }}
                    className="h-9 rounded-lg border border-line bg-surface px-2 text-sm" />
                </div>

                {/* Per-day timing */}
                {schedule.length > 0 && (
                  <div className="rounded-lg border border-line-soft bg-surface-2/40 p-2.5">
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input type="checkbox" checked={perDay} onChange={(e) => setPerDay(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
                      <span>
                        <span className="font-medium">Different reminder time for each meeting day</span>
                        <span className="block text-[11px] text-ink-faint">e.g. remind the day before for Sunday, but the same morning for Wednesday.</span>
                      </span>
                    </label>
                    {perDay && (
                      <div className="mt-2.5 space-y-2">
                        {DAYS_FULL.filter((d) => schedule.some((s) => s.day === d)).map((d) => {
                          const r = customFor(d);
                          const choice = r?.off ? "off" : r ? String(r.leadDays) : "default";
                          return (
                            <div key={d} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2">
                              <span className="w-24 shrink-0 text-xs font-semibold">{d}</span>
                              <select
                                value={choice}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === "default") setRemind(d, undefined);
                                  else if (v === "off") setRemind(d, { off: true, leadDays: 0, hour: remHour, minute: remMinute });
                                  else setRemind(d, { leadDays: Number(v), hour: r?.hour ?? remHour, minute: r?.minute ?? remMinute });
                                }}
                                className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-sm"
                              >
                                <option value="default">Same as above</option>
                                <option value="0">The same day</option>
                                <option value="1">The day before</option>
                                {[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} days before</option>)}
                                <option value="off">Don’t remind</option>
                              </select>
                              {r && !r.off && (
                                <>
                                  <span className="text-xs text-ink-muted">at</span>
                                  <input
                                    type="time"
                                    value={hhmm(r.hour, r.minute)}
                                    onChange={(e) => { const m = /^(\d{1,2}):(\d{2})$/.exec(e.target.value); if (m) setRemind(d, { leadDays: r.leadDays, hour: Math.min(23, +m[1]), minute: Math.min(59, +m[2]) }); }}
                                    className="h-9 rounded-lg border border-line bg-surface px-2 text-sm"
                                  />
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-ink-muted">You’ll send it yourself with the <b>Remind</b> button on the group.</p>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">Message</label>
              <textarea
                name="meetingReminderText"
                rows={3}
                defaultValue={group?.meetingReminderText ?? ""}
                placeholder={DEFAULT_MEETING_REMINDER}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
              />
              <p className="mt-1 text-[11px] text-ink-faint">Placeholders: {"{church}"} {"{group}"} {"{when}"} {"{days}"} {"{time}"}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
