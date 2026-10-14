"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserRoundSearch, Loader2, MessageSquareText, Check, Phone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/components/ui/feedback";
import { saveAbsenceSettings } from "@/app/actions/automations";
import { cn } from "@/lib/utils";

export type AbsenceData = {
  on: boolean;
  weeks: number;
  textMember: boolean;
  alertAdmins: boolean;
  members: { id: string; name: string; phone: string | null; lastSeen: string; weeksAway: number; texted: boolean; alerted: boolean; stale: boolean }[];
};

const WEEK_CHOICES = [1, 2, 3, 4, 6, 8, 12];

/** "We have not seen you in a while": how many weeks, who is told, and who is away right now. */
export function AbsenceCard({ data, canWrite }: { data: AbsenceData; canWrite: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(data.on);
  const [weeks, setWeeks] = useState(data.weeks);
  const [textMember, setTextMember] = useState(data.textMember);
  const [alertAdmins, setAlertAdmins] = useState(data.alertAdmins);
  const [showAll, setShowAll] = useState(false);

  const dirty = on !== data.on || weeks !== data.weeks || textMember !== data.textMember || alertAdmins !== data.alertAdmins;
  const rows = showAll ? data.members : data.members.slice(0, 8);

  const save = () =>
    start(async () => {
      const res = await saveAbsenceSettings({ on, weeks, textMember, alertAdmins });
      if (res.ok) { toast(on ? "Saved. Away members will be looked after automatically." : "Saved. This is switched off.", "success"); router.refresh(); }
      else toast(res.error, "error");
    });

  return (
    <Card className="mb-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><UserRoundSearch className="size-5" /></div>
          <div>
            <h3 className="font-display text-lg font-semibold">We haven&apos;t seen you in a while</h3>
            <p className="mt-0.5 max-w-2xl text-sm text-ink-muted">
              Looks at check-ins. Anyone who has attended before but has not checked in for the weeks you choose is gently texted, and your admins are told.
              People who have never attended are not counted.
            </p>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <span className={cn("relative h-6 w-11 rounded-full transition-colors", on ? "bg-primary" : "bg-line")}>
            <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[1.375rem]" : "left-0.5")} />
            <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} disabled={!canWrite} className="sr-only" />
          </span>
          {on ? "On" : "Off"}
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
        <div className="space-y-3 rounded-xl border border-line p-4">
          <label className="block text-sm font-medium text-ink-muted">Count someone as away after</label>
          <select
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            disabled={!canWrite}
            className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm"
          >
            {WEEK_CHOICES.map((w) => <option key={w} value={w}>{w === 1 ? "1 week (they missed a Sunday)" : `${w} weeks without checking in`}</option>)}
          </select>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={textMember} onChange={(e) => setTextMember(e.target.checked)} disabled={!canWrite} className="mt-0.5 size-4 rounded border-line accent-primary" />
            <span>Text the member<span className="block text-xs text-ink-faint">A kind message, sent once. Coming back resets it.</span></span>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={alertAdmins} onChange={(e) => setAlertAdmins(e.target.checked)} disabled={!canWrite} className="mt-0.5 size-4 rounded border-line accent-primary" />
            <span>Tell my admins<span className="block text-xs text-ink-faint">One text and email listing who has not been seen.</span></span>
          </label>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" onClick={save} disabled={!canWrite || pending || !dirty}>
              {pending ? <><Loader2 className="animate-spin" /> Saving…</> : <><Check /> Save</>}
            </Button>
            <Link href="/app/messages?focus=absent_member">
              <Button size="sm" variant="secondary" type="button"><MessageSquareText /> Edit the messages</Button>
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-line">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold">Away right now</span>
            <Badge variant={data.members.length ? "gold" : "default"}>{data.members.length}</Badge>
          </div>
          {data.members.length === 0 ? (
            <p className="p-4 text-sm text-ink-faint">Nobody has been away for {data.weeks} week{data.weeks === 1 ? "" : "s"} or more.</p>
          ) : (
            <>
              <ul className="divide-y divide-line-soft">
                {rows.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{m.name}</div>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
                        <span>Last here {new Date(m.lastSeen).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                        {m.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" /> {m.phone}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-xs font-semibold text-warning">{m.weeksAway} wk away</span>
                      <span className="text-[10px] text-ink-faint">
                        {m.stale ? "Away a long time" : on ? (m.texted || m.alerted ? "Already told" : "Next check") : "Not texted yet"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              {data.members.length > 8 && (
                <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full border-t border-line px-4 py-2.5 text-xs font-medium text-primary hover:bg-surface-2">
                  {showAll ? "Show fewer" : `Show all ${data.members.length}`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
