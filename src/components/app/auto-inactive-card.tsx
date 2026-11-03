"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserMinus, Loader2, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toastNow } from "@/components/ui/feedback";
import { previewAutoInactive, saveAutoInactiveSettings } from "@/app/actions/automations";

export type AutoInactiveData = { on: boolean; weeks: number; locked: boolean };

/** The few options a church actually thinks in. The server accepts 4 to 104 weeks. */
const CHOICES = [
  { weeks: 8, label: "2 months" },
  { weeks: 12, label: "3 months" },
  { weeks: 26, label: "6 months" },
  { weeks: 52, label: "1 year" },
];

/**
 * Max: members who have stopped coming are moved to inactive automatically.
 * Switching it on moves everyone who is already away, so the card shows who that would be before it is saved.
 */
export function AutoInactiveCard({ data, canWrite }: { data: AutoInactiveData; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(data.on);
  const [weeks, setWeeks] = useState(data.weeks);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewAutoInactive>> | null>(null);
  const [loading, setLoading] = useState(false);

  // Only worth looking up when the church is about to turn it on or tighten it: that is when people move.
  const changes = on && (!data.on || weeks < data.weeks);
  useEffect(() => {
    if (data.locked || !changes) { setPreview(null); return; }
    let live = true;
    setLoading(true);
    previewAutoInactive(weeks).then((p) => { if (live) { setPreview(p); setLoading(false); } }).catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [changes, weeks, data.locked]);

  const dirty = on !== data.on || weeks !== data.weeks;

  if (data.locked) {
    return (
      <Card className="mb-4 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-faint"><Lock className="size-4" /></span>
          <div>
            <h3 className="font-display text-[1rem] font-semibold">Mark members inactive automatically</h3>
            <p className="mt-0.5 text-sm text-ink-muted">
              Part of the Max plan. After a set number of weeks with no attendance, a member is moved to inactive for you, so your lists
              and reports reflect who is really coming.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const save = () =>
    start(async () => {
      try {
        await saveAutoInactiveSettings({ on, weeks });
        toastNow(on ? "Saved. Members away that long will be marked inactive tonight." : "Saved. Nobody will be marked inactive automatically.", "success");
        router.refresh();
      } catch (e) {
        toastNow((e as Error).message || "Could not save. Please try again.", "error");
      }
    });

  return (
    <Card className="mb-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary-bright"><UserMinus className="size-4" /></span>
          <div>
            <h3 className="font-display text-[1rem] font-semibold">Mark members inactive automatically</h3>
            <p className="mt-0.5 max-w-xl text-sm text-ink-muted">
              A member who has attended before, but has not been checked in for this long, is moved to inactive each night. Nothing is deleted,
              and you can set anyone back to active in People.
            </p>
          </div>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" role="switch" checked={on} disabled={!canWrite || pending} onChange={(e) => setOn(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
          {on ? "On" : "Off"}
        </label>
      </div>

      {on && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-muted">After no attendance for</span>
          <select
            value={weeks}
            disabled={!canWrite || pending}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="h-9 rounded-lg border border-line bg-surface px-2 text-sm"
          >
            {!CHOICES.some((c) => c.weeks === weeks) && <option value={weeks}>{weeks} weeks</option>}
            {CHOICES.map((c) => <option key={c.weeks} value={c.weeks}>{c.label}</option>)}
          </select>
        </div>
      )}

      {changes && (
        <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-ink">
          {loading || !preview ? (
            <span className="flex items-center gap-2 text-ink-muted"><Loader2 className="size-4 animate-spin" /> Checking who this would affect…</span>
          ) : preview.reason === "not_tracking" ? (
            <>Nobody has been checked in during the last three weeks, so nothing will be moved: it cannot tell absent members from attendance not being taken.</>
          ) : preview.reason === "mass_change" ? (
            <><b>{preview.total} members</b> would be moved, which is a very large share of your church. To be safe, nothing is moved until fewer would be. Try a longer period.</>
          ) : preview.total === 0 ? (
            <>Nobody is away that long right now, so nobody would be moved today.</>
          ) : (
            <>
              <b>{preview.total} member{preview.total === 1 ? "" : "s"}</b> {preview.total === 1 ? "is" : "are"} already away that long and would be marked inactive tonight
              ({preview.names.join(", ")}{preview.total > preview.names.length ? " and more" : ""}).
            </>
          )}
        </div>
      )}

      {canWrite && dirty && (
        <div className="mt-4">
          <Button onClick={save} disabled={pending}>
            {pending ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save"}
          </Button>
        </div>
      )}
    </Card>
  );
}
