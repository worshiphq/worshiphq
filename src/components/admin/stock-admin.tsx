"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Eye, EyeOff, Film, Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { stockAddItem, stockDelete, stockUpdate, stockUploadLinks } from "@/app/actions/media-stock";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  title: string;
  category: string;
  kind: "image" | "video";
  width: number;
  height: number;
  seconds?: number;
  bytes: number;
  hidden?: boolean;
  credit?: string;
  thumbUrl: string;
}

const fmtSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const input = "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-teal-400/60";

/** Reads a picture or video in the browser: its size, length and a 480×270 thumbnail. */
async function inspect(file: File): Promise<{ width: number; height: number; seconds?: number; thumb: Blob }> {
  const url = URL.createObjectURL(file);
  try {
    let source: CanvasImageSource, width: number, height: number, seconds: number | undefined;
    if (file.type.startsWith("video") || /\.(mp4|webm|mov)$/i.test(file.name)) {
      const v = document.createElement("video");
      v.muted = true;
      v.preload = "auto";
      v.src = url;
      await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error("This video can't be read by the browser.")); });
      v.currentTime = Math.min(3, v.duration / 2);
      await new Promise((res) => (v.onseeked = res));
      source = v; width = v.videoWidth; height = v.videoHeight; seconds = v.duration;
    } else {
      const img = new Image();
      img.src = url;
      await img.decode();
      source = img; width = img.naturalWidth; height = img.naturalHeight;
    }
    const c = document.createElement("canvas");
    c.width = 480; c.height = 270;
    const ctx = c.getContext("2d")!;
    const s = Math.max(480 / width, 270 / height);
    ctx.drawImage(source, (480 - width * s) / 2, (270 - height * s) / 2, width * s, height * s);
    const thumb = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.82));
    return { width, height, seconds, thumb };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Upload pictures and motion loops that churches can download free inside WorshipHQ Live. */
export function StockAdmin({ items, storageReady }: { items: Row[]; storageReady: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("");
  const [credit, setCredit] = useState("");
  const [owned, setOwned] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [filter, setFilter] = useState("all");
  const categories = useMemo(() => [...new Set(items.map((i) => i.category))].sort(), [items]);
  const shown = items.filter((i) => filter === "all" || i.category === filter || (filter === "hidden" && i.hidden));

  async function upload(files: File[]) {
    if (!files.length) return;
    setMsg(null);
    let ok = 0;
    for (let n = 0; n < files.length; n++) {
      const f = files[n];
      setProgress({ done: n, total: files.length, name: f.name });
      try {
        const info = await inspect(f);
        const links = await stockUploadLinks(f.name);
        const put = await fetch(links.fileUrl, { method: "PUT", body: f, headers: { "Content-Type": links.contentType } });
        if (!put.ok) throw new Error(`storage said ${put.status}`);
        const putThumb = await fetch(links.thumbUrl, { method: "PUT", body: info.thumb, headers: { "Content-Type": "image/jpeg" } });
        if (!putThumb.ok) throw new Error(`storage said ${putThumb.status}`);
        await stockAddItem({
          id: links.id, file: links.file, thumb: links.thumb, kind: links.kind,
          title: f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
          category: category || (links.kind === "video" ? "Motion" : "Pictures"),
          width: info.width, height: info.height, seconds: info.seconds, bytes: f.size, credit: credit || undefined,
        });
        ok++;
      } catch (e) {
        const text = e instanceof TypeError
          ? "The upload was blocked. The storage bucket needs CORS allowing PUT from this site."
          : e instanceof Error ? e.message : String(e);
        setMsg({ kind: "err", text: `${f.name}: ${text}` });
        break;
      }
    }
    setProgress(null);
    if (ok) setMsg((m) => m ?? { kind: "ok", text: `${ok} background${ok === 1 ? "" : "s"} added. Churches see them in WorshipHQ Live › Pictures & videos › Free backgrounds.` });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Backgrounds for WorshipHQ Live</h1>
        <p className="mt-1 max-w-3xl text-sm text-white/60">
          Pictures and motion loops that churches with WorshipHQ Live can download free inside the app. Only upload work WorshipHQ made,
          owns, or holds a licence to give out (for example public-domain or CC0 with the credit filled in). Never upload pictures or videos
          downloaded from YouTube, Google or social media.
        </p>
      </div>

      {!storageReady && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="size-4" /> Storage (Cloudflare R2) isn&apos;t set up on this server.
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="font-semibold text-white">Add backgrounds</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-white/70">
            Category
            <input list="stock-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Bokeh, The cross, Easter" className={cn(input, "mt-1")} />
            <datalist id="stock-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="block text-sm text-white/70">
            Credit / licence (shown to churches)
            <input value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Made by WorshipHQ" className={cn(input, "mt-1")} />
          </label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-white/80">
          <input type="checkbox" checked={owned} onChange={(e) => setOwned(e.target.checked)} className="mt-0.5 size-4 accent-teal-500" />
          WorshipHQ made these, owns them, or holds a licence that allows giving them to churches.
        </label>
        <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" className="hidden"
          onChange={(e) => { upload([...(e.target.files ?? [])]); e.target.value = ""; }} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={!owned || !!progress || !storageReady}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:opacity-50"
        >
          {progress ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {progress ? `Uploading ${progress.done + 1} of ${progress.total}: ${progress.name}` : "Choose pictures or videos"}
        </button>
        <p className="mt-2 text-xs text-white/40">Best: 1920×1080 or 3840×2160. Videos as MP4 (H.264), seamless loops of 10 to 30 seconds.</p>
        {msg && <p className={cn("mt-3 text-sm", msg.kind === "ok" ? "text-teal-300" : "text-red-300")}>{msg.text}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {["all", ...categories, "hidden"].map((c) => (
          <button key={c} onClick={() => setFilter(c)} className={cn("rounded-full px-3 py-1 text-xs font-medium", filter === c ? "bg-teal-500 text-white" : "bg-white/[0.06] text-white/70 hover:bg-white/10")}>
            {c === "all" ? `All (${items.length})` : c === "hidden" ? "Hidden" : c}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-white/50">Nothing here yet.</p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {shown.map((i) => (
            <div key={i.id} className={cn("overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]", i.hidden && "opacity-50")}>
              <div className="relative aspect-video bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={i.thumbUrl} alt="" className="h-full w-full object-cover" />
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
                  {i.kind === "video" ? <Film className="size-3" /> : <ImageIcon className="size-3" />}
                  {i.width}×{i.height}{i.seconds ? ` · ${i.seconds}s` : ""}
                </span>
              </div>
              <div className="space-y-1 p-3">
                <input defaultValue={i.title} onBlur={(e) => e.target.value !== i.title && start(() => stockUpdate(i.id, { title: e.target.value }))}
                  className="w-full bg-transparent text-sm font-semibold text-white outline-none focus:underline" />
                <input defaultValue={i.category} onBlur={(e) => e.target.value !== i.category && start(() => stockUpdate(i.id, { category: e.target.value }))}
                  className="w-full bg-transparent text-xs text-white/60 outline-none focus:underline" />
                <div className="flex items-center justify-between pt-1 text-xs text-white/40">
                  <span>{fmtSize(i.bytes)}</span>
                  <span className="flex gap-1">
                    <button title={i.hidden ? "Show to churches" : "Hide from churches"} onClick={() => start(() => stockUpdate(i.id, { hidden: !i.hidden }))} className="rounded p-1 hover:bg-white/10 hover:text-white">
                      {i.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </button>
                    <button title="Delete" onClick={() => { if (confirm(`Delete “${i.title}” from the server? Churches that already downloaded it keep their copy.`)) start(() => stockDelete(i.id)); }} className="rounded p-1 hover:bg-red-500/20 hover:text-red-300">
                      <Trash2 className="size-4" />
                    </button>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
