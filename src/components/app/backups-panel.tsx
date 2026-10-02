"use client";

import { useEffect, useState, useTransition } from "react";
import { DatabaseBackup, Download, Loader2, Trash2, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getBackupOverview, backUpNow, setAutoBackup, removeBackup } from "@/app/actions/backups";
import { cn } from "@/lib/utils";

type Overview = Awaited<ReturnType<typeof getBackupOverview>>;

const TRIGGER: Record<string, string> = { auto: "Automatic", manual: "Manual", admin: "By WorshipHQ support" };

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function BackupsPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"backup" | "toggle" | string | null>(null);
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

  function run(kind: "backup" | "toggle" | string, fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
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
              A complete, encrypted copy of your church&rsquo;s records: members, giving, attendance, events, messages and settings. Download one any time to keep your own copy.
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
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            <CheckCircle2 className="size-4" /> {notice}
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
            className={cn(
              "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
              data.autoBackup ? "bg-primary" : "bg-line",
            )}
          >
            <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", data.autoBackup ? "translate-x-6" : "translate-x-1")} />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button onClick={() => run("backup", backUpNow, "Backup complete. It is listed below.")} disabled={ro || !data.configured || busy === "backup"}>
            {busy === "backup" ? <><Loader2 className="size-4 animate-spin" /> Backing up your data…</> : <><DatabaseBackup className="size-4" /> Back up now</>}
          </Button>
          <span className="text-xs text-ink-muted">
            {lastOk ? `Last backup: ${fmtWhen(lastOk.createdAt)}` : "No backup yet."}
          </span>
        </div>
        {ro && <p className="mt-3 text-xs text-ink-faint">Only an Owner or Admin can run or change backups.</p>}
      </Card>

      <Card className="p-6">
        <h3 className="font-display text-base font-semibold">Your backups</h3>
        {data.backups.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-muted">No backups yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-line">
            {data.backups.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {fmtWhen(b.createdAt)}
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted">{TRIGGER[b.trigger] ?? b.trigger}</span>
                    {b.status === "failed" && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-medium text-danger">Failed</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    {b.status === "ok" ? `${b.rowCount.toLocaleString()} records · ${fmtSize(b.sizeBytes)}` : b.error ?? "Backup failed."}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {b.status === "ok" && (
                    <a
                      href={`/api/backups/${b.id}`}
                      className="inline-flex h-9 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-surface-2"
                    >
                      <Download className="size-4" /> Download
                    </a>
                  )}
                  {!ro && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Delete backup"
                      disabled={busy === b.id}
                      onClick={() => { if (confirm("Delete this backup permanently?")) run(b.id, () => removeBackup(b.id)); }}
                    >
                      {busy === b.id ? <><Loader2 className="size-4 animate-spin" /> Deleting…</> : <Trash2 className="size-4" />}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 flex items-start gap-2 text-xs text-ink-faint">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          Backups are encrypted at rest. They do not include login passwords or fingerprint data.
        </p>
      </Card>
    </div>
  );
}
