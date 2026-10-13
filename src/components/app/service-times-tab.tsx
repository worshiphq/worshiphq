"use client";

import { useEffect, useState } from "react";
import { Clock, Loader2, Pencil, Plus, Trash2, Check, X, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { getServiceTimes, setServiceTimesOptions, saveServiceSlot, deleteServiceSlot, type ServiceTimesData } from "@/app/actions/service-times";
import { cn } from "@/lib/utils";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const pretty = (m: number) => {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${((h + 11) % 12) + 1}:${String(min).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

type Draft = { id?: string; name: string; weekday: number; start: string; end: string; branchId: string; active: boolean };
const EMPTY: Draft = { name: "", weekday: 0, start: "07:00", end: "09:30", branchId: "", active: true };

/** Settings → Service times: name each regular service and its time window. */
export function ServiceTimesTab({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<ServiceTimesData | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [grace, setGrace] = useState("60");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const d = await getServiceTimes();
    setData(d);
    setGrace(String(d.grace));
  }
  useEffect(() => { void load(); }, []);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, after?: (r: Record<string, unknown>) => void) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else {
        after?.(r);
        await load();
      }
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <Card className="flex items-center gap-2 p-6 text-sm text-ink-muted">
        <Loader2 className="size-4 animate-spin" /> Loading service times…
      </Card>
    );
  }

  const byDay = DAYS.map((name, weekday) => ({ name, weekday, slots: data.slots.filter((s) => s.weekday === weekday) })).filter((d) => d.slots.length);

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h3 className="font-display text-lg font-semibold text-ink">Service times</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Running more than one service a day? Name each one and its time. Check-ins then go to the right service
              automatically, whether by name, QR or fingerprint, on every device.
            </p>
          </div>
          {canManage && (
            <Button
              variant={data.on ? "secondary" : "primary"}
              disabled={busy !== null}
              onClick={() => run("toggle", () => setServiceTimesOptions({ on: !data.on, grace: Number(grace) }))}
            >
              {busy === "toggle" ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : data.on ? "Turn off" : "Turn on"}
            </Button>
          )}
        </div>

        <div className={cn("mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm", data.on ? "border-success/30 bg-success/10" : "border-line bg-surface-2/60")}>
          <Clock className={cn("size-4", data.on ? "text-success" : "text-ink-faint")} />
          {data.on ? (
            data.now ? (
              <span>On. A check-in right now goes to <strong>{data.now.name}</strong>{data.now.matched ? "" : " (no service is scheduled at this time)"}.</span>
            ) : (
              <span>On.</span>
            )
          ) : (
            <span className="text-ink-muted">Off. Each &ldquo;Start check-in&rdquo; opens a new service, as before.</span>
          )}
        </div>

        {canManage && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="grace">Early or late arrivals join the nearest service within</Label>
              <div className="flex items-center gap-2">
                <Input id="grace" type="number" min={0} max={240} value={grace} onChange={(e) => setGrace(e.target.value)} className="w-24" />
                <span className="text-sm text-ink-muted">minutes</span>
              </div>
            </div>
            <Button variant="secondary" disabled={busy !== null || Number(grace) === data.grace} onClick={() => run("grace", () => setServiceTimesOptions({ on: data.on, grace: Number(grace) }))}>
              {busy === "grace" ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save"}
            </Button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {notice && <p className="mt-3 flex items-center gap-1.5 text-sm text-warning"><AlertTriangle className="size-4" /> {notice}</p>}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-6">
          <div>
            <h3 className="font-display text-[1rem] font-semibold text-ink">Your services</h3>
            <p className="text-sm text-ink-muted">e.g. &ldquo;1st Service&rdquo; and &ldquo;2nd Service&rdquo;, or &ldquo;Twi Service&rdquo; and &ldquo;English Service&rdquo;.</p>
          </div>
          {canManage && !draft && (
            <Button size="sm" onClick={() => setDraft({ ...EMPTY })}><Plus className="size-4" /> Add service</Button>
          )}
        </div>

        {draft && (
          <SlotForm
            draft={draft}
            setDraft={setDraft}
            branches={data.branches}
            saving={busy === "save"}
            onCancel={() => { setDraft(null); setError(""); }}
            onSave={() =>
              run("save", () => saveServiceSlot({ ...draft, branchId: draft.branchId || null }), (r) => {
                setDraft(null);
                if (Number(r.overlaps) > 0) setNotice("This overlaps another service on the same day. Inside the overlap, the one that starts later is used.");
              })
            }
          />
        )}

        {byDay.length === 0 && !draft ? (
          <p className="p-6 text-sm text-ink-faint">No services yet. Add your first one, then turn service times on.</p>
        ) : (
          <div className="divide-y divide-line-soft">
            {byDay.map((d) => (
              <div key={d.weekday} className="px-6 py-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{d.name}</div>
                <ul className="space-y-2">
                  {d.slots.map((s) => (
                    <li key={s.id} className={cn("flex flex-wrap items-center gap-3 rounded-xl border border-line bg-base px-4 py-3", !s.active && "opacity-60")}>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{s.name} {!s.active && <span className="text-xs font-normal text-ink-faint">(paused)</span>}</div>
                        <div className="text-sm text-ink-muted">
                          {pretty(s.startMinute)} to {pretty(s.endMinute)}
                          {data.branches.length > 1 && <> · {s.branchName ?? "All branches"}</>}
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setDraft({ id: s.id, name: s.name, weekday: s.weekday, start: hhmm(s.startMinute), end: hhmm(s.endMinute), branchId: s.branchId ?? "", active: s.active })}
                            className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-surface-2 hover:text-ink"
                            title="Edit"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => {
                              if (!confirmBinDelete(`Remove "${s.name}"? Past attendance stays as it is.`)) return;
                              void run(`del-${s.id}`, () => deleteServiceSlot(s.id), (r) => {
                                binDeleted();
                                if (r.turnedOff) setNotice("That was your last service, so service times have been turned off.");
                              });
                            }}
                            className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                            title="Remove"
                          >
                            {busy === `del-${s.id}` ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function SlotForm({
  draft, setDraft, branches, saving, onSave, onCancel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  branches: { id: string; name: string }[];
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const select = "flex h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none";
  return (
    <div className="space-y-4 border-b border-line bg-surface-2/40 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="slotName">Service name</Label>
          <Input id="slotName" value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} placeholder="e.g. 1st Service, Twi Service" autoFocus />
        </div>
        <div>
          <Label htmlFor="slotDay">Day</Label>
          <select id="slotDay" value={draft.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })} className={select}>
            {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="slotStart">Starts</Label>
          <Input id="slotStart" type="time" value={draft.start} onChange={(e) => set({ start: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="slotEnd">Ends</Label>
          <Input id="slotEnd" type="time" value={draft.end} onChange={(e) => set({ end: e.target.value })} />
        </div>
        {branches.length > 1 && (
          <div>
            <Label htmlFor="slotBranch">Branch</Label>
            <select id="slotBranch" value={draft.branchId} onChange={(e) => set({ branchId: e.target.value })} className={select}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        {draft.id && (
          <label className="flex items-center gap-2 self-end pb-3 text-sm">
            <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} className="size-4 rounded border-line accent-primary" />
            Active (untick to pause without deleting)
          </label>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={onSave} disabled={saving}>
          {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : <><Check className="size-4" /> {draft.id ? "Save changes" : "Add service"}</>}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={saving}><X className="size-4" /> Cancel</Button>
      </div>
    </div>
  );
}
