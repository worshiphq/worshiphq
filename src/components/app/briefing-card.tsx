"use client";

import { useState } from "react";
import { CalendarClock, Loader2, Lock, Mail, MessageSquare, Send, Sparkles } from "lucide-react";
import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { toastNow } from "@/components/ui/feedback";
import { PlanBadge } from "@/components/app/plan-gate";
import { saveBriefing, sendBriefingPreview } from "@/app/actions/briefing";
import { BRIEFING_SECTIONS, type BriefingSettings } from "@/lib/briefing/settings";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const field = "h-10 rounded-lg border border-line bg-base px-3 text-sm text-ink outline-none focus:border-primary/60";
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? "am" : "pm"}`;

const WHAT = [
  "Last Sunday's attendance, up or down from the week before",
  "Giving this month against last month",
  "New visitors to welcome",
  "Regulars who have missed 2 weeks or more, by name",
  "This week's birthdays",
  "Follow-ups that are overdue",
];

export function BriefingCard({ initial, team, locked, canWrite }: {
  initial: BriefingSettings;
  team: { id: string; name: string; role: string; hasPhone?: boolean }[];
  locked: boolean;
  canWrite: boolean;
}) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState<"save" | "preview" | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);

  if (locked) {
    return (
      <div className="mb-6 rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600"><CalendarClock className="size-5" /></div>
            <div>
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold">Monday briefing <PlanBadge plan="max" /></h3>
              <p className="mt-1 max-w-xl text-sm text-ink-muted">Start every week knowing your church. One report every Monday morning, by email or SMS, for you and your leaders:</p>
              <ul className="mt-2 grid gap-1 text-sm text-ink-muted sm:grid-cols-2">{WHAT.map((w) => <li key={w}>• {w}</li>)}</ul>
            </div>
          </div>
          <Link href="/app/settings?tab=billing" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            <Lock className="size-4" /> Unlock with Max
          </Link>
        </div>
      </div>
    );
  }

  const save = async () => {
    setBusy("save");
    try { await saveBriefing(s); toastNow(s.on ? `Saved. The briefing goes out every ${DAYS[s.day]} at ${hourLabel(s.hour)}.` : "Saved. The briefing is off.", "success"); }
    catch (e) { toastNow(e instanceof Error ? e.message : "Could not save.", "error"); }
    setBusy(null);
  };
  const preview = async () => {
    setBusy("preview");
    try { const r = await sendBriefingPreview(s.sections); toastNow(r.ok ? `This week's briefing was emailed to you. ${r.message}` : r.error, r.ok ? "success" : "error"); }
    catch (e) { toastNow(e instanceof Error ? e.message : "Could not send.", "error"); }
    setBusy(null);
  };
  // SMS cost: about 2 credits per person per week (the briefing is 2 SMS long).
  const smsPeople = (s.userIds.length ? team.filter((u) => s.userIds.includes(u.id)) : team.filter((u) => ["Owner", "Admin", "Pastor"].includes(u.role))).filter((u) => u.hasPhone).length;
  const toggleUser = (id: string) => setS({ ...s, userIds: s.userIds.includes(id) ? s.userIds.filter((x) => x !== id) : [...s.userIds, id] });

  return (
    <div className="mb-6 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-bright"><CalendarClock className="size-5" /></div>
          <div>
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold">Monday briefing <PlanBadge plan="max" /></h3>
            <p className="mt-1 max-w-xl text-sm text-ink-muted">One report at the start of each week: attendance, giving, new visitors, who&rsquo;s missing, birthdays and overdue follow-ups.</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" disabled={!canWrite} checked={s.on} onChange={(e) => setS({ ...s, on: e.target.checked })} className="size-5 accent-[var(--color-primary)]" />
          {s.on ? "On" : "Off"}
        </label>
      </div>

      <div className={`mt-4 grid gap-4 sm:grid-cols-2 ${s.on ? "" : "opacity-60"}`}>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">When</div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <select disabled={!canWrite} value={s.day} onChange={(e) => setS({ ...s, day: Number(e.target.value) })} className={field} aria-label="Day">
              {DAYS.map((d, i) => <option key={d} value={i}>Every {d}</option>)}
            </select>
            <select disabled={!canWrite} value={s.hour} onChange={(e) => setS({ ...s, hour: Number(e.target.value) })} className={field} aria-label="Time">
              {Array.from({ length: 16 }, (_, i) => i + 5).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </div>
          <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">How</div>
          <div className="mt-1.5 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" disabled={!canWrite} checked={s.email} onChange={(e) => setS({ ...s, email: e.target.checked })} className="size-4 accent-[var(--color-primary)]" /><Mail className="size-4 text-ink-muted" /> Email (free)</label>
            <label className="flex items-center gap-2"><input type="checkbox" disabled={!canWrite} checked={s.sms} onChange={(e) => setS({ ...s, sms: e.target.checked })} className="size-4 accent-[var(--color-primary)]" /><MessageSquare className="size-4 text-ink-muted" /> SMS (uses credits)</label>
          </div>
          {s.sms && (
            <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-ink">
              Text messages use your SMS credits: about <strong>2 credits per person</strong> each week.
              {smsPeople > 0 ? <> For {smsPeople} {smsPeople === 1 ? "person" : "people"}, that&rsquo;s about <strong>{smsPeople * 2} credits a week</strong> (about {smsPeople * 9} a month).</> : " Nobody chosen has a phone number yet."}
              {" "}Email is free.
            </p>
          )}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Who gets it</div>
          <p className="mt-1 text-xs text-ink-faint">Tick people, or leave all unticked to send it to every Owner, Admin and Pastor.</p>
          <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-line p-2 text-sm">
            {team.map((u) => (
              <label key={u.id} className="flex items-center gap-2">
                <input type="checkbox" disabled={!canWrite} checked={s.userIds.includes(u.id)} onChange={() => toggleUser(u.id)} className="size-4 accent-[var(--color-primary)]" />
                {u.name} <span className="text-xs text-ink-faint">{u.role}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className={`mt-4 ${s.on ? "" : "opacity-60"}`}>
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">What to include</div>
        <p className="mt-1 text-xs text-ink-faint">Attendance, giving, visitors, who is missing, birthdays and follow-ups are always in. Add any of these. Email shows everything; SMS keeps to the main lines so it does not cost more.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {BRIEFING_SECTIONS.map((x) => (
            <label key={x.key} className="flex items-start gap-2 rounded-lg border border-line p-2.5 text-sm">
              <input type="checkbox" disabled={!canWrite} checked={s.sections.includes(x.key)} onChange={(e) => setS({ ...s, sections: e.target.checked ? [...s.sections, x.key] : s.sections.filter((k) => k !== x.key) })} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
              <span><span className="font-medium text-ink">{x.label}</span><span className="block text-xs text-ink-muted">{x.hint}</span></span>
            </label>
          ))}
        </div>
      </div>

      {canWrite && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={preview} disabled={!!busy}>
            {busy === "preview" ? <><Loader2 className="animate-spin" /> Sending preview...</> : <><Send /> Email me this week&rsquo;s briefing</>}
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={!!busy || !dirty}>
            {busy === "save" ? <><Loader2 className="animate-spin" /> Saving...</> : <><Sparkles /> Save</>}
          </Button>
        </div>
      )}
    </div>
  );
}
