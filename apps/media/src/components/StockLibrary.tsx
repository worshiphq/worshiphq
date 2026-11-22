import { useEffect, useMemo, useState } from "react";
import { Check, CloudDownload, Film, Image as ImageIcon, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useMediaStore, type MediaItem } from "../stores/media-store";
import { formatBytes, isDesktopApp, mediaUrl } from "../lib/media-src";

/** Where WorshipHQ Media finds the WorshipHQ server (can be changed for testing). */
export function apiBase(): string {
  try {
    return localStorage.getItem("whq-api-base") || "https://worshiphq.app";
  } catch {
    return "https://worshiphq.app";
  }
}

interface Entry {
  id: string;
  title: string;
  category: string;
  kind: "image" | "video";
  thumb: string;
  /** Came with the installer (a local file) or is on the WorshipHQ server. */
  local?: string;
  online?: { ext: string; bytes: number; width: number; height: number; seconds: number | null };
}

type Kind = "all" | "image" | "video";

/** WorshipHQ's own free backgrounds: the ones that came with the installer, plus more from the server. */
export function StockLibrary({ onAdded }: { onAdded: (item: MediaItem) => void }) {
  const { items, addStockFile } = useMediaStore();
  const [bundled, setBundled] = useState<Entry[]>([]);
  const [online, setOnline] = useState<Entry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "offline" | "unlicensed">("loading");
  const [kind, setKind] = useState<Kind>("all");
  const [category, setCategory] = useState("all");
  const [busy, setBusy] = useState<Record<string, number>>({}); // id → percent
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const added = useMemo(() => new Set(items.map((i) => i.stockId).filter(Boolean)), [items]);

  async function load() {
    if (!isDesktopApp()) { setStatus("offline"); return; }
    setStatus("loading");
    const { invoke } = await import("@tauri-apps/api/core");
    const local = await invoke<{ id: string; title: string; category: string; path: string; thumb: string }[]>("stock_bundled").catch(() => []);
    setBundled(local.map((b) => ({ id: b.id, title: b.title, category: b.category, kind: "image", thumb: mediaUrl(b.thumb), local: b.path })));
    const licence = await invoke<string | null>("stock_licence").catch(() => null);
    if (!licence) { setStatus("unlicensed"); return; }
    try {
      const res = await fetch(`${apiBase()}/api/media/stock`, { headers: { "X-WHQ-Licence": licence } });
      if (res.status === 401) { setStatus("unlicensed"); return; }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items: { id: string; title: string; category: string; kind: "image" | "video"; thumbUrl: string; ext: string; bytes: number; width: number; height: number; seconds: number | null }[] };
      setOnline(data.items.map((i) => ({ id: i.id, title: i.title, category: i.category, kind: i.kind, thumb: i.thumbUrl, online: { ext: i.ext, bytes: i.bytes, width: i.width, height: i.height, seconds: i.seconds } })));
      setStatus("ready");
    } catch {
      setStatus("offline");
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // One tile per background: the server copy (full quality) when we can reach it, else the one from the installer.
  const all = useMemo(() => {
    const map = new Map<string, Entry>();
    for (const b of bundled) map.set(b.id, b);
    for (const o of online) map.set(o.id, { ...o, local: map.get(o.id)?.local });
    return [...map.values()];
  }, [bundled, online]);
  const categories = useMemo(() => [...new Set(all.map((e) => e.category))], [all]);
  const shown = all.filter((e) => (kind === "all" || e.kind === kind) && (category === "all" || e.category === category));

  async function add(e: Entry): Promise<MediaItem | null> {
    const { invoke } = await import("@tauri-apps/api/core");
    setError(null);
    setBusy((b) => ({ ...b, [e.id]: 0 }));
    try {
      let file: { path: string; name: string; kind: "image" | "video" | "audio"; size: number };
      if (e.online) {
        const licence = await invoke<string | null>("stock_licence");
        const res = await fetch(`${apiBase()}/api/media/stock/${encodeURIComponent(e.id)}`, { headers: { "X-WHQ-Licence": licence ?? "" } });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "The WorshipHQ server didn't answer.");
        const link = (await res.json()) as { url: string; bytes: number; ext: string };
        const token = `stock-${e.id}-${Date.now().toString(36)}`.replace(/[^a-zA-Z0-9-]/g, "");
        const timer = setInterval(() => {
          invoke<number>("stock_progress", { token, ext: link.ext })
            .then((n) => setBusy((b) => (e.id in b ? { ...b, [e.id]: Math.min(99, Math.round((n / Math.max(1, link.bytes)) * 100)) } : b)))
            .catch(() => {});
        }, 300);
        try {
          file = await invoke("stock_download", { url: link.url, ext: link.ext, token, title: e.title, kind: e.kind });
        } finally {
          clearInterval(timer);
        }
      } else {
        const [copied] = await invoke<typeof file[]>("media_import", { paths: [e.local!] });
        file = { ...copied, name: e.title };
      }
      return addStockFile(file, e.id);
    } catch (err) {
      setError(`${e.title}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[e.id]; return n; });
    }
  }

  async function addAll(list: Entry[]) {
    const todo = list.filter((e) => !added.has(e.id));
    setBatch({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      const r = await add(todo[i]);
      setBatch({ done: i + 1, total: todo.length });
      if (!r) break;
    }
    setBatch(null);
  }

  const notYet = shown.filter((e) => !added.has(e.id));
  const totalBytes = notYet.reduce((n, e) => n + (e.online?.bytes ?? 0), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <Sparkles className="size-4 text-primary-bright" />
        <span className="text-[14px] font-semibold text-ink">Free backgrounds made by WorshipHQ</span>
        <div className="ml-2 flex rounded-lg bg-surface-4 p-0.5">
          {([["all", "All"], ["image", "Pictures"], ["video", "Motion"]] as [Kind, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
              className={`rounded-md px-2.5 py-0.5 text-[12px] font-medium ${kind === k ? "bg-surface-2 font-semibold text-primary-bright shadow-sm" : "text-ink-muted hover:text-ink"}`}>{l}</button>
          ))}
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 rounded-lg border border-line-bright bg-surface-2 px-2 text-[13px] text-ink">
          <option value="all">Every style</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex-1" />
        {notYet.length > 0 && (
          <button onClick={() => addAll(notYet)} disabled={!!batch}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-bold text-white hover:bg-primary-bright disabled:opacity-70">
            {batch ? <Loader2 className="size-4 whq-spin" /> : <CloudDownload className="size-4" />}
            {batch ? `Adding ${batch.done + 1} of ${batch.total}…` : `Add all ${notYet.length}${totalBytes ? ` (${formatBytes(totalBytes)})` : ""}`}
          </button>
        )}
      </div>

      {status === "unlicensed" && (
        <p className="mx-4 mt-3 rounded-lg bg-primary-soft/60 px-3 py-2 text-[13px] text-ink">
          These pictures came with WorshipHQ Media. Activate your licence to download the full collection, including the motion backgrounds.
        </p>
      )}
      {status === "offline" && (
        <p className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-surface-4 px-3 py-2 text-[13px] text-ink">
          <span className="flex-1">Couldn't reach WorshipHQ for the full collection, so only the pictures that came with the app are shown.</span>
          <button onClick={load} className="flex items-center gap-1 font-semibold text-primary-bright hover:underline"><RefreshCw className="size-3.5" /> Try again</button>
        </p>
      )}
      {error && <p className="mx-4 mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p>}

      <div className="flex-1 overflow-y-auto p-4">
        {status === "loading" && all.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[14px] text-ink-muted"><Loader2 className="size-5 whq-spin" /> Loading backgrounds…</div>
        ) : shown.length === 0 ? (
          <p className="py-16 text-center text-[14px] text-ink-muted">No backgrounds here yet.</p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
            {shown.map((e) => {
              const have = added.has(e.id);
              const pct = busy[e.id];
              return (
                <button key={e.id}
                  onClick={async () => {
                    if (have) { const it = items.find((i) => i.stockId === e.id); if (it) onAdded(it); return; }
                    if (pct !== undefined) return;
                    const it = await add(e);
                    if (it) onAdded(it);
                  }}
                  title={have ? "Already in your Media" : "Add to your Media"}
                  className="group rounded-lg p-1.5 text-left hover:bg-surface-4">
                  <div className="relative aspect-video overflow-hidden rounded-md bg-ink ring-1 ring-line">
                    <img src={e.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                    {e.kind === "video" && <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white"><Film className="size-3" /> Motion</span>}
                    {e.online && <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">{e.online.height >= 2160 ? "4K" : "HD"}</span>}
                    {pct !== undefined ? (
                      <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1.5">
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/25"><div className="h-full bg-primary transition-[width]" style={{ width: `${Math.max(4, pct)}%` }} /></div>
                        <div className="mt-0.5 text-center text-[11px] font-semibold text-white">{e.online ? `${pct}%` : "Adding…"}</div>
                      </div>
                    ) : have ? (
                      <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[11px] font-bold text-white"><Check className="size-3" /> Added</span>
                    ) : (
                      <span className="absolute inset-0 hidden items-center justify-center bg-black/35 text-[13px] font-bold text-white group-hover:flex">
                        <CloudDownload className="mr-1.5 size-4" /> Add{e.online?.bytes ? ` · ${formatBytes(e.online.bytes)}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
                    {e.kind === "video" ? <Film className="size-3.5 shrink-0 text-ink-faint" /> : <ImageIcon className="size-3.5 shrink-0 text-ink-faint" />}
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{e.title}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
