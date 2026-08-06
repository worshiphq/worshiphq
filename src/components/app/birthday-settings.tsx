"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Cake, Bell, Users, Clock, Check, Loader2, MessageSquare, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { saveBirthdaySettings } from "@/app/actions/automations";
import { SystemMessagesDialog } from "@/components/app/system-messages-dialog";
import { cn } from "@/lib/utils";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIMEZONES = ["Africa/Accra", "Africa/Lagos", "Africa/Nairobi", "Africa/Johannesburg", "Europe/London", "America/New_York", "America/Chicago", "America/Los_Angeles"];

type Settings = { timezone: string; sendHour: number; wishOn: boolean; adminAlertOn: boolean; digestOn: boolean; digestDay: number };

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors", on ? "bg-primary" : "bg-surface-2 border border-line", disabled && "opacity-50")}>
      <span className={cn("inline-block size-4 transform rounded-full bg-white shadow transition-transform", on ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}

function hourLabel(h: number) {
  const ampm = h < 12 ? "am" : "pm";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${ampm}`;
}

export function BirthdaySettings({ settings, membersWithPhone, adminCount, canWrite, messageTemplates }: {
  settings: Settings; membersWithPhone: number; adminCount: number; canWrite: boolean; messageTemplates?: Record<string, string>;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [s, setS] = useState(settings);
  const [showMessages, setShowMessages] = useState(false);
  const set = (patch: Partial<Settings>) => setS((prev) => ({ ...prev, ...patch }));

  const save = () => {
    const fd = new FormData();
    fd.set("timezone", s.timezone);
    fd.set("sendHour", String(s.sendHour));
    fd.set("digestDay", String(s.digestDay));
    if (s.wishOn) fd.set("wishOn", "on");
    if (s.adminAlertOn) fd.set("adminAlertOn", "on");
    if (s.digestOn) fd.set("digestOn", "on");
    start(async () => {
      const r = await saveBirthdaySettings(fd);
      if (r?.ok) { toast("Birthday settings saved", "success"); router.refresh(); }
      else toast(r?.error ?? "Failed", "error");
    });
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10"><Cake className="size-5 text-primary" /></div>
          <div>
            <h3 className="font-display text-lg font-semibold">Birthday reminders</h3>
            <p className="text-xs text-ink-muted">Automatic — sent at your chosen hour, wherever your church is.</p>
          </div>
        </div>
        {canWrite && (
          <Button variant="secondary" size="sm" onClick={() => setShowMessages(true)}><MessageSquare className="size-4" /> Edit messages</Button>
        )}
      </div>

      <div className="space-y-3">
        {/* Member wish */}
        <div className="flex items-start justify-between gap-3 rounded-xl border border-line p-3">
          <div className="flex items-start gap-2.5">
            <Cake className="mt-0.5 size-4 text-primary" />
            <div>
              <div className="text-sm font-medium">Wish members on their birthday</div>
              <div className="text-xs text-ink-muted">Texts the member a happy-birthday on the day. ~{membersWithPhone} members have a phone → about 1 SMS per birthday.</div>
            </div>
          </div>
          <Toggle on={s.wishOn} onChange={(v) => set({ wishOn: v })} disabled={!canWrite} />
        </div>

        {/* Admin same-day alert */}
        <div className="flex items-start justify-between gap-3 rounded-xl border border-line p-3">
          <div className="flex items-start gap-2.5">
            <Bell className="mt-0.5 size-4 text-primary" />
            <div>
              <div className="text-sm font-medium">Tell admins whose birthday is today</div>
              <div className="text-xs text-ink-muted">On the day, texts + emails admins ({adminCount} with a phone) the day's birthdays.</div>
            </div>
          </div>
          <Toggle on={s.adminAlertOn} onChange={(v) => set({ adminAlertOn: v })} disabled={!canWrite} />
        </div>

        {/* Weekly digest */}
        <div className="rounded-xl border border-line p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Users className="mt-0.5 size-4 text-primary" />
              <div>
                <div className="text-sm font-medium">Weekly birthday list to admins</div>
                <div className="text-xs text-ink-muted">Once a week, texts + emails admins the coming week's birthdays.</div>
              </div>
            </div>
            <Toggle on={s.digestOn} onChange={(v) => set({ digestOn: v })} disabled={!canWrite} />
          </div>
          {s.digestOn && (
            <div className="mt-2 flex items-center gap-2 pl-6 text-sm">
              <span className="text-xs text-ink-muted">Send every</span>
              <select value={s.digestDay} onChange={(e) => set({ digestDay: Number(e.target.value) })} disabled={!canWrite}
                className="h-8 rounded-lg border border-line bg-surface px-2 text-sm">
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Time + timezone */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <span className="text-sm font-medium">Send at</span>
            <select value={s.sendHour} onChange={(e) => set({ sendHour: Number(e.target.value) })} disabled={!canWrite}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-sm">
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-muted">in</span>
            <select value={s.timezone} onChange={(e) => set({ timezone: e.target.value })} disabled={!canWrite}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-sm">
              {TIMEZONES.includes(s.timezone) ? null : <option value={s.timezone}>{s.timezone}</option>}
              {TIMEZONES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-surface-2/60 p-3 text-xs text-ink-muted">
          <Wallet className="mt-0.5 size-3.5 shrink-0" />
          <span>Every text uses SMS credits. Birthday wishes cost ~1 credit each; the admin alert &amp; weekly list cost about {adminCount} credit(s) per send. Turn off any you don't want.</span>
        </div>
      </div>

      {canWrite && (
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={save} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save reminders</Button>
        </div>
      )}

      {showMessages && <SystemMessagesDialog saved={messageTemplates ?? {}} onClose={() => setShowMessages(false)} />}
    </Card>
  );
}
