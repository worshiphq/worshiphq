"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, Loader2, Trash2, Upload } from "lucide-react";
import { deleteMediaBible, updateMediaBible } from "@/app/actions/media-bibles";
import { cn } from "@/lib/utils";

interface BibleRow {
  id: string;
  abbreviation: string;
  name: string;
  language: string;
  format: string;
  sizeBytes: number;
  licence: string;
  audience: "all" | "churches";
  churchIds: string[];
  active: boolean;
  downloads: number;
  createdAt: string;
}

const fmtSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const input = "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-teal-400/60";

/** Upload Bibles your church holds licences for, and choose which churches can download them in WorshipHQ Live. */
export function BiblesAdmin({ bibles, churches, storageReady }: { bibles: BibleRow[]; churches: { id: string; name: string }[]; storageReady: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ name: "", abbreviation: "", language: "English", licence: "", audience: "churches" as "all" | "churches", churchIds: [] as string[] });
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [churchFilter, setChurchFilter] = useState("");
  const names = useMemo(() => new Map(churches.map((c) => [c.id, c.name])), [churches]);

  function pick(f: File | null) {
    setFile(f);
    if (f) {
      const abbr = f.name.replace(/\.[^.]+$/, "").toUpperCase();
      setForm((x) => ({ ...x, abbreviation: x.abbreviation || abbr }));
    }
  }

  async function upload() {
    if (!file) return;
    setMsg(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    Object.entries(form).forEach(([k, v]) => fd.append(k, Array.isArray(v) ? v.join(",") : v));
    try {
      const res = await fetch("/api/admin/media-bibles", { method: "POST", body: fd });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error ?? "Upload failed.");
      setMsg({ kind: "ok", text: `${form.abbreviation || file.name} uploaded.` });
      setFile(null);
      setForm({ name: "", abbreviation: "", language: "English", licence: "", audience: "churches", churchIds: [] });
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
    setUploading(false);
  }

  function save(id: string, changes: Parameters<typeof updateMediaBible>[1]) {
    start(async () => { await updateMediaBible(id, changes); router.refresh(); });
  }

  const shownChurches = churches.filter((c) => c.name.toLowerCase().includes(churchFilter.toLowerCase())).slice(0, 60);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-white" />
          <h2 className="font-semibold text-white">Bibles for WorshipHQ Live</h2>
        </div>
        <p className="mt-1 text-sm text-white/50">
          Upload Bibles you hold licences for. Churches you choose can download them inside WorshipHQ Live (Settings › Bible versions).
          Files are stored privately and only handed to signed-in churches they're published to.
        </p>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Only publish a Bible to other churches if your licence covers giving it to them. Record the licence below so it's on file.
        </div>
        {!storageReady && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">R2 storage isn't configured in this environment, so uploads won't work.</div>
        )}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="mb-1 block text-xs font-medium text-white/60">Bible file (.ewb from EasyWorship, or a WorshipHQ Bible)</span>
            <input ref={fileRef} type="file" accept=".ewb,.gz" onChange={(e) => pick(e.target.files?.[0] ?? null)} className="block w-full text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-500 file:px-3 file:py-2 file:font-semibold file:text-white" />
          </label>
          <label><span className="mb-1 block text-xs font-medium text-white/60">Short name</span><input className={input} value={form.abbreviation} onChange={(e) => setForm({ ...form, abbreviation: e.target.value })} placeholder="NKJV" /></label>
          <label><span className="mb-1 block text-xs font-medium text-white/60">Full name</span><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="New King James Version" /></label>
          <label><span className="mb-1 block text-xs font-medium text-white/60">Language</span><input className={input} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} /></label>
          <label>
            <span className="mb-1 block text-xs font-medium text-white/60">Who can download it</span>
            <select className={input} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as "all" | "churches" })}>
              <option value="churches">Only the churches I choose</option>
              <option value="all">Every church with WorshipHQ Live</option>
            </select>
          </label>
          <label className="md:col-span-2">
            <span className="mb-1 block text-xs font-medium text-white/60">Licence (who holds it, what it allows, reference number)</span>
            <textarea className={cn(input, "min-h-[70px]")} value={form.licence} onChange={(e) => setForm({ ...form, licence: e.target.value })} placeholder="e.g. Licensed to Grace Baptist Church, licence #…, valid until …" />
          </label>
          {form.audience === "churches" && (
            <div className="md:col-span-2">
              <span className="mb-1 block text-xs font-medium text-white/60">Churches ({form.churchIds.length} chosen)</span>
              <input className={cn(input, "mb-2")} value={churchFilter} onChange={(e) => setChurchFilter(e.target.value)} placeholder="Search churches" />
              <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
                {shownChurches.map((c) => {
                  const on = form.churchIds.includes(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => setForm({ ...form, churchIds: on ? form.churchIds.filter((x) => x !== c.id) : [...form.churchIds, c.id] })}
                      className={cn("rounded-full px-3 py-1 text-xs font-medium", on ? "bg-teal-500 text-white" : "bg-white/[0.06] text-white/70 hover:bg-white/10")}>
                      {on ? "✓ " : ""}{c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={upload} disabled={!file || uploading || !storageReady || (form.audience === "churches" && !form.churchIds.length)}
            className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:opacity-40">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload Bible
          </button>
          {msg && <span className={cn("text-sm", msg.kind === "ok" ? "text-teal-300" : "text-red-300")}>{msg.text}</span>}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="font-semibold text-white">Published Bibles ({bibles.length})</h2>
        {bibles.length === 0 ? (
          <p className="mt-2 text-sm text-white/50">Nothing uploaded yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-white/10">
            {bibles.map((b) => (
              <div key={b.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="w-20 shrink-0 font-bold text-white">{b.abbreviation}</div>
                <div className="min-w-[220px] flex-1">
                  <div className="text-sm font-medium text-white">{b.name} <span className="text-white/40">· {b.language} · {fmtSize(b.sizeBytes)} · {b.downloads} download{b.downloads === 1 ? "" : "s"}</span></div>
                  <div className="mt-0.5 text-xs text-white/50">
                    {b.audience === "all" ? "Every church with WorshipHQ Live" : `Only: ${b.churchIds.map((id) => names.get(id) ?? "a removed church").join(", ") || "no churches yet"}`}
                  </div>
                  {b.licence && <div className="mt-0.5 text-xs text-white/40">Licence: {b.licence}</div>}
                </div>
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input type="checkbox" checked={b.active} onChange={(e) => save(b.id, { active: e.target.checked })} /> Available
                </label>
                <button onClick={() => { if (confirm(`Delete ${b.abbreviation}? Churches that already downloaded it keep their copy.`)) start(async () => { await deleteMediaBible(b.id); router.refresh(); }); }}
                  className="rounded-lg p-2 text-white/40 hover:bg-red-500/10 hover:text-red-300" aria-label={`Delete ${b.abbreviation}`}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
