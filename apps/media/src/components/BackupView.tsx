import { useState } from "react";
import { Cloud, Copy, Download, FolderOpen, Loader2, Upload } from "lucide-react";
import { backupCode, cloudBackup, cloudRestore, lastCloudBackup, openBackupFile, saveBackupFile } from "../lib/backup";

/** Settings › Backup: keep the church's songs, schedules and settings safe, and move them to another computer. */
export function BackupView() {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [last, setLast] = useState(lastCloudBackup());
  const [code, setCode] = useState("");
  const [auto, setAutoRaw] = useState(() => localStorage.getItem("whq-backup-auto") !== "0");
  const setAuto = (v: boolean) => { setAutoRaw(v); localStorage.setItem("whq-backup-auto", v ? "1" : "0"); };
  const mine = backupCode();

  async function run(name: string, f: () => Promise<unknown>, done?: string) {
    setBusy(name); setMsg(null);
    try { await f(); if (done) setMsg({ ok: true, text: done }); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    setBusy(null);
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto grid max-w-3xl gap-3">
        <section className="rounded-xl border border-line bg-surface-2 p-4 shadow-sm">
          <h3 className="mb-1 flex items-center gap-2 text-[16px] font-semibold text-ink"><Cloud className="size-5 text-primary-bright" /> WorshipHQ cloud backup</h3>
          <p className="mb-3 text-[13px] text-ink-muted">Songs, schedules, templates, looks, profiles and settings are kept safe with WorshipHQ. If this computer breaks, install WorshipHQ Media on another one and type the backup code below.</p>
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-primary-soft/60 px-3 py-2.5">
            <span className="text-[13px] text-ink-muted">This church's backup code</span>
            <code className="select-all font-mono text-[18px] font-bold tracking-wider text-ink">{mine}</code>
            <button onClick={() => navigator.clipboard.writeText(mine)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold text-primary-bright hover:bg-primary-soft"><Copy className="size-3.5" /> Copy</button>
            <span className="w-full text-[12px] text-ink-faint">Write it down somewhere safe (with your church records). Anyone with this code and a WorshipHQ Media licence can restore your songs.</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => run("up", async () => setLast(await cloudBackup()), "Backed up to WorshipHQ.")} disabled={!!busy}
              className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[14px] font-bold text-white hover:bg-primary-bright disabled:opacity-60">
              {busy === "up" ? <Loader2 className="size-4 whq-spin" /> : <Upload className="size-4" />} Back up now
            </button>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
              Back up by itself once a day (when there is internet)
            </label>
            <span className="text-[12px] text-ink-faint">{last ? `Last backup: ${new Date(last).toLocaleString()}` : "Not backed up yet"}</span>
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <span className="mb-1.5 block text-[13px] font-medium text-ink">Restore on this computer from a backup code</span>
            <div className="flex flex-wrap gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD-EFGH-JKLM"
                className="h-10 w-48 rounded-lg border border-line-bright px-3 font-mono text-[14px] tracking-wider" />
              <button onClick={() => run("down", () => cloudRestore(code))} disabled={!!busy || code.replace(/-/g, "").length !== 12}
                className="flex h-10 items-center gap-2 rounded-lg border border-line-bright px-4 text-[14px] font-semibold text-ink hover:bg-surface-4 disabled:opacity-50">
                {busy === "down" ? <Loader2 className="size-4 whq-spin" /> : <Download className="size-4" />} Restore
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface-2 p-4 shadow-sm">
          <h3 className="mb-1 text-[16px] font-semibold text-ink">Backup file</h3>
          <p className="mb-3 text-[13px] text-ink-muted">Save everything to one file (for a USB stick or Google Drive), or bring it back. Pictures and videos stay in their own folder; copy that too if you move computers (Settings › About › Open the folder).</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => run("save", saveBackupFile)} disabled={!!busy} className="flex h-10 items-center gap-2 rounded-lg border border-line-bright px-4 text-[14px] font-semibold text-ink hover:bg-surface-4"><Download className="size-4" /> Save a backup file</button>
            <button onClick={() => run("open", openBackupFile)} disabled={!!busy} className="flex h-10 items-center gap-2 rounded-lg border border-line-bright px-4 text-[14px] font-semibold text-ink hover:bg-surface-4"><FolderOpen className="size-4" /> Restore from a file</button>
          </div>
        </section>
        {msg && <p className={`rounded-lg px-3 py-2 text-[13px] ${msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
