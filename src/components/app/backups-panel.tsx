"use client";

import { useEffect, useState, useTransition } from "react";
import { DatabaseBackup, Loader2, Trash2, ShieldCheck, AlertTriangle, CheckCircle2, History, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getBackupOverview, backUpNow, setAutoBackup, removeBackup,
  getBackupContents, previewRestore, restoreBackup,
} from "@/app/actions/backups";
import { cn } from "@/lib/utils";

type Overview = Awaited<ReturnType<typeof getBackupOverview>>;
type Contents = { label: string; count: number }[];
type Plan = { id: string; loading: boolean; add?: number; revert?: number; remove?: number; backupDate?: string; error?: string };

const TRIGGER: Record<string, string> = {
  auto: "Automatic",
  manual: "Manual",
  admin: "By WorshipHQ support",
  "pre-restore": "Saved before a restore",
};

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function BackupsPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [contents, setContents] = useState<Record<string, Contents | "loading" | "error">>({});
  const [plan, setPlan] = useState<Plan | null>(null);
  const [typed, setTyped] = useState("");
  const [, start] = useTransition();

  const load = () => getBackupOverview().then(setData).catch(() => setError("Could not load backups."));
  useEffect(() => { load(); }, []);

  if (!data) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink-muted">
          <Loader2 className="size-4 animate-spin" /> Loading your backups…
        </div>
      </Card>
    );
  }

  const ro = !data.canManage;
  const lastOk = data.backups.find((b) => b.status === "ok");

  function run(kind: string, fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    setError("");
    setNotice("");
    setBusy(kind);
    start(async () => {
      try {
        const res = await fn();
        if (!res.ok) setError(res.error ?? "Something went wrong.");
        else if (done) setNotice(done);
        await load();
      } catch (e) {
        setError((e as Error).message || "Something went wrong.");
      }
      setBusy(null);
    });
  }

  function toggleInside(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (contents[id]) return;
    setContents((c) => ({ ...c, [id]: "loading" }));
    start(async () => {
      const res = await getBackupContents(id).catch(() => null);
      setContents((c) => ({ ...c, [id]: res && res.ok ? res.items : "error" }));
    });
  }

  function startRestore(id: string) {
    setError("");
    setNotice("");
    setTyped("");
    setPlan({ id, loading: true });
    start(async () => {
      const res = await previewRestore(id).catch((e) => ({ ok: false as const, error: (e as Error).message }));
      setPlan(res.ok ? { id, loading: false, add: res.add, revert: res.revert, remove: res.remove, backupDate: res.backupDate } : { id, loading: false, error: res.error });
    });
  }

  function confirmRestore(id: string) {
    setError("");
    setBusy(`restore-${id}`);
    start(async () => {
      const res = await restoreBackup(id).catch((e) => ({ ok: false, error: (e as Error).message }) as Awaited<ReturnType<typeof restoreBackup>>);
      setBusy(null);
      setPlan(null);
      if (!res.ok) setError(res.error ?? "Restore failed.");
      else {
        setNotice(
          `Your church is back to how it was. ${res.added} record${res.added === 1 ? "" : "s"} brought back, ${res.reverted} changed back, ${res.removed} removed.` +
          (res.skipped ? ` ${res.skipped} could not be changed.` : "") +
          " We saved your data from just before as a backup, in case you need to go back.",
        );
      }
      await load();
    });
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-bright">
            <DatabaseBackup className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-semibold">Data backups</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Each backup is a restore point: a saved copy of your church&rsquo;s records at that moment. If something goes wrong, you can return your church to any of them. Need a copy of your data as a spreadsheet? Use Export.
            </p>
          </div>
        </div>

        {!data.configured && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Backups are being set up on this server and will be available soon.
          </div>
        )}
        {error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
        {notice && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {notice}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface-2/40 p-4">
          <div>
            <div className="text-sm font-semibold">Automatic daily backup</div>
            <p className="mt-0.5 text-xs text-ink-muted">
              {data.autoBackup
                ? data.platformEnabled
                  ? `On. We keep your latest ${data.keep} backups.`
                  : "On for your church, but automatic backups are paused platform-wide right now."
                : "Off. Nothing is backed up unless you press Back up now."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={data.autoBackup}
            aria-label="Automatic daily backup"
            disabled={ro || busy === "toggle"}
            onClick={() => run("toggle", () => setAutoBackup(!data.autoBackup))}
            className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", data.autoBackup ? "bg-primary" : "bg-line")}
          >
            <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", data.autoBackup ? "translate-x-6" : "translate-x-1")} />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button onClick={() => run("backup", backUpNow, "Backup complete. It is listed below.")} disabled={ro || !data.configured || busy === "backup"}>
            {busy === "backup" ? <><Loader2 className="size-4 animate-spin" /> Backing up your data…</> : <><DatabaseBackup className="size-4" /> Back up now</>}
          </Button>
          <span className="text-xs text-ink-muted">{lastOk ? `Last backup: ${fmtWhen(lastOk.createdAt)}` : "No backup yet."}</span>
        </div>
        {ro && <p className="mt-3 text-xs text-ink-faint">Only an Owner or Admin can back up or restore.</p>}
      </Card>

      <Card className="p-6">
        <h3 className="font-display text-base font-semibold">Restore points</h3>
        {data.backups.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-muted">No backups yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-line">
            {data.backups.map((b) => {
              const c = contents[b.id];
              const isPlan = plan?.id === b.id;
              const restoring = busy === `restore-${b.id}`;
              return (
                <div key={b.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {fmtWhen(b.createdAt)}
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted">{TRIGGER[b.trigger] ?? b.trigger}</span>
                        {b.status === "failed" && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-medium text-danger">Failed</span>}
                      </div>
                      {b.status === "failed" && <div className="mt-0.5 text-xs text-danger">{b.error ?? "Backup failed."}</div>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {b.status === "ok" && (
                        <Button variant="ghost" size="sm" onClick={() => toggleInside(b.id)} aria-expanded={open === b.id}>
                          What&rsquo;s inside <ChevronDown className={cn("size-4 transition-transform", open === b.id && "rotate-180")} />
                        </Button>
                      )}
                      {b.status === "ok" && !ro && (
                        <Button variant="outline" size="sm" disabled={isPlan && plan.loading} onClick={() => startRestore(b.id)}>
                          {isPlan && plan.loading ? <><Loader2 className="size-4 animate-spin" /> Checking…</> : <><History className="size-4" /> Restore to this point</>}
                        </Button>
                      )}
                      {!ro && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Delete backup"
                          disabled={busy === b.id}
                          onClick={() => { if (confirm("Delete this backup permanently?")) run(b.id, async () => ({ ok: (await removeBackup(b.id)).ok })); }}
                        >
                          {busy === b.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {open === b.id && (
                    <div className="mt-3 rounded-xl border border-line bg-surface-2/40 p-4 text-sm">
                      {c === "loading" || c === undefined ? (
                        <span className="inline-flex items-center gap-2 text-ink-muted"><Loader2 className="size-4 animate-spin" /> Reading this backup…</span>
                      ) : c === "error" ? (
                        <span className="text-danger">Could not read this backup.</span>
                      ) : c.length === 0 ? (
                        <span className="text-ink-muted">This backup has no records yet.</span>
                      ) : (
                        <>
                          <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">This backup has</div>
                          <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                            {c.map((x) => (
                              <li key={x.label} className="flex justify-between gap-4">
                                <span className="text-ink-muted">{x.label}</span>
                                <span className="font-semibold tabular-nums">{x.count.toLocaleString()}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}

                  {isPlan && !plan.loading && (
                    <div className="mt-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm">
                      {plan.error ? (
                        <>
                          <p className="text-danger">{plan.error}</p>
                          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setPlan(null)}>Close</Button>
                        </>
                      ) : (
                        <>
                          <p className="flex items-center gap-2 font-semibold text-danger">
                            <AlertTriangle className="size-4" /> Are you sure? This will overwrite your current data.
                          </p>
                          <p className="mt-2 text-ink-muted">
                            Your church will go back to exactly how it was on <span className="font-medium text-ink">{fmtWhen(plan.backupDate ?? b.createdAt)}</span>. Anything done since then will be lost:
                          </p>
                          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ink-muted">
                            <li><span className="font-medium text-ink">{plan.remove}</span> record{plan.remove === 1 ? "" : "s"} added since then will be removed</li>
                            <li><span className="font-medium text-ink">{plan.revert}</span> record{plan.revert === 1 ? "" : "s"} edited since then will be changed back</li>
                            <li><span className="font-medium text-ink">{plan.add}</span> record{plan.add === 1 ? "" : "s"} deleted since then will be brought back</li>
                          </ul>
                          <p className="mt-2 text-xs text-ink-faint">
                            Login accounts, billing and SMS credits are not affected. We save your current data as a backup first, so you can go back if you change your mind.
                          </p>
                          {plan.add === 0 && plan.revert === 0 && plan.remove === 0 ? (
                            <p className="mt-3 text-ink-muted">Nothing would change. Your church already matches this backup.</p>
                          ) : (
                            <div className="mt-3 flex flex-wrap items-end gap-3">
                              <label className="text-xs text-ink-muted">
                                Type <span className="font-bold text-ink">RESTORE</span> to confirm
                                <input
                                  value={typed}
                                  onChange={(e) => setTyped(e.target.value)}
                                  autoCapitalize="characters"
                                  className="mt-1 block h-10 w-40 rounded-xl border border-line bg-base px-3 text-sm text-ink outline-none focus:border-primary"
                                />
                              </label>
                              <Button variant="danger" size="sm" disabled={typed.trim().toUpperCase() !== "RESTORE" || restoring} onClick={() => confirmRestore(b.id)}>
                                {restoring ? <><Loader2 className="size-4 animate-spin" /> Restoring your church…</> : "Restore to this point"}
                              </Button>
                            </div>
                          )}
                          <Button size="sm" variant="ghost" className="mt-2" disabled={restoring} onClick={() => setPlan(null)}>Cancel</Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-4 flex items-start gap-2 text-xs text-ink-faint">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          Backups are encrypted and kept private. They do not include login passwords or fingerprint data.
        </p>
      </Card>
    </div>
  );
}
