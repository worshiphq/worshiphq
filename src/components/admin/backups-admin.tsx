"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DatabaseBackup, Download, Loader2, AlertTriangle, CheckCircle2, Play, Mail } from "lucide-react";
import { adminBackUpChurch, adminSetChurchAutoBackup, adminSaveBackupSettings, adminRunDueBackups, adminEmailBackup } from "@/app/actions/admin-backups";
import { cn } from "@/lib/utils";

interface ChurchRow {
  id: string;
  name: string;
  slug: string;
  autoBackup: boolean;
  lastBackupAt: string | null;
  lastAttemptAt: string | null;
  count: number;
  bytes: number;
}
interface RecentRow { id: string; church: string; trigger: string; sizeBytes: number; rowCount: number; createdAt: string }

const fmtWhen = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const DAY = 86400000;

export function BackupsAdmin({
  configured, enabled, keep, churches, recent,
}: { configured: boolean; enabled: boolean; keep: number; churches: ChurchRow[]; recent: RecentRow[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [keepInput, setKeepInput] = useState(String(keep));
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function act(id: string, fn: () => Promise<{ ok: boolean; error?: string; summary?: unknown }>, okText: string) {
    setMsg(null);
    setBusy(id);
    start(async () => {
      try {
        const res = await fn();
        setMsg(res.ok ? { kind: "ok", text: okText } : { kind: "err", text: res.error ?? "Something went wrong." });
      } catch (e) {
        setMsg({ kind: "err", text: (e as Error).message || "Something went wrong." });
      }
      setBusy(null);
      router.refresh();
    });
  }

  const totalBytes = churches.reduce((s, c) => s + c.bytes, 0);
  const stale = churches.filter((c) => c.autoBackup && (!c.lastBackupAt || Date.now() - new Date(c.lastBackupAt).getTime() > 2 * DAY)).length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center gap-2">
          <DatabaseBackup className="size-4 text-white" />
          <h2 className="font-semibold text-white">Backups</h2>
        </div>
        <p className="mt-1 text-sm text-white/50">
          Every church is backed up automatically each night (encrypted, stored in R2) unless that church switches it off. {churches.length} churches, {fmtSize(totalBytes)} stored.
        </p>

        {!configured && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            BACKUP_ENCRYPTION_KEY (or the R2 keys) is not set in this environment, so no backup can run. Add it in Vercel and redeploy.
          </div>
        )}
        {configured && stale > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {stale} church{stale === 1 ? "" : "es"} with auto-backup on {stale === 1 ? "has" : "have"} no backup in the last 2 days.
          </div>
        )}
        {msg && (
          <div className={cn("mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm",
            msg.kind === "ok" ? "border-teal-500/30 bg-teal-500/10 text-teal-300" : "border-red-500/30 bg-red-500/10 text-red-300")}>
            {msg.kind === "ok" ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />} {msg.text}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-end gap-6">
          <label className="flex items-center gap-3 text-sm text-white">
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              disabled={busy === "settings"}
              onClick={() => act("settings", () => adminSaveBackupSettings({ enabled: !enabled, keep: Number(keepInput) }), enabled ? "Scheduled backups paused for everyone." : "Scheduled backups resumed.")}
              className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50", enabled ? "bg-teal-500" : "bg-white/20")}
            >
              <span className={cn("inline-block size-4 rounded-full bg-white transition-transform", enabled ? "translate-x-6" : "translate-x-1")} />
            </button>
            Scheduled backups {enabled ? "on" : "paused"}
          </label>

          <div className="flex items-end gap-2">
            <label className="text-xs text-white/50">
              Backups kept per church
              <input
                value={keepInput}
                onChange={(e) => setKeepInput(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className="mt-1 block h-9 w-24 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-teal-400"
              />
            </label>
            <button
              type="button"
              disabled={busy === "settings" || Number(keepInput) === keep}
              onClick={() => act("settings", () => adminSaveBackupSettings({ enabled, keep: Number(keepInput) }), "Retention saved.")}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm text-white hover:bg-white/15 disabled:opacity-40"
            >
              {busy === "settings" ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save"}
            </button>
          </div>

          <button
            type="button"
            disabled={!configured || busy === "due"}
            onClick={() => act("due", adminRunDueBackups, "Finished. Churches that were due have been backed up.")}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-teal-500 px-4 text-sm font-semibold text-[#06201f] hover:bg-teal-400 disabled:opacity-40"
          >
            {busy === "due" ? <><Loader2 className="size-4 animate-spin" /> Backing up due churches…</> : <><Play className="size-4" /> Run due backups now</>}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h3 className="font-semibold text-white">Churches</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
                <th className="py-2 pr-3">Church</th>
                <th className="py-2 pr-3">Auto</th>
                <th className="py-2 pr-3">Last backup</th>
                <th className="py-2 pr-3">Stored</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {churches.map((c) => (
                <tr key={c.id} className="border-b border-white/5 last:border-0">
                  <td className="py-3 pr-3 text-white">{c.name}</td>
                  <td className="py-3 pr-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={c.autoBackup}
                      aria-label={`Auto backup for ${c.name}`}
                      disabled={busy === `auto-${c.id}`}
                      onClick={() => act(`auto-${c.id}`, () => adminSetChurchAutoBackup(c.id, !c.autoBackup).then(() => ({ ok: true })), `${c.name}: auto backup ${c.autoBackup ? "off" : "on"}.`)}
                      className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50", c.autoBackup ? "bg-teal-500" : "bg-white/20")}
                    >
                      <span className={cn("inline-block size-3.5 rounded-full bg-white transition-transform", c.autoBackup ? "translate-x-4.5" : "translate-x-0.5")} />
                    </button>
                  </td>
                  <td className="py-3 pr-3 text-white/70">
                    {c.lastBackupAt ? fmtWhen(c.lastBackupAt) : <span className="text-amber-300">Never</span>}
                  </td>
                  <td className="py-3 pr-3 text-white/60">{c.count} · {fmtSize(c.bytes)}</td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      disabled={!configured || busy === `run-${c.id}`}
                      onClick={() => act(`run-${c.id}`, () => adminBackUpChurch(c.id), `${c.name} backed up.`)}
                      className="inline-flex h-8 items-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-40"
                    >
                      {busy === `run-${c.id}` ? <><Loader2 className="size-3.5 animate-spin" /> Backing up…</> : "Back up now"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h3 className="font-semibold text-white">Latest backups</h3>
        {recent.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-white/40">No backups yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-white/5">
            {recent.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <span className="text-white">{r.church}</span>
                  <span className="ml-2 text-xs text-white/40">{fmtWhen(r.createdAt)} · {r.trigger} · {r.rowCount.toLocaleString()} records · {fmtSize(r.sizeBytes)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <a href={`/api/backups/${r.id}`} className="inline-flex h-8 items-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/15">
                    <Download className="size-3.5" /> Download
                  </a>
                  <button
                    type="button"
                    disabled={busy === `mail-${r.id}`}
                    onClick={() => act(`mail-${r.id}`, () => adminEmailBackup(r.id), `Backup emailed to ${r.church}.`)}
                    className="inline-flex h-8 items-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-40"
                  >
                    {busy === `mail-${r.id}` ? <><Loader2 className="size-3.5 animate-spin" /> Emailing…</> : <><Mail className="size-3.5" /> Email to church</>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
