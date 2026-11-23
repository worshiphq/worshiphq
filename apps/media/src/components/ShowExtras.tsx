import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useExtrasStore, DEFAULT_ADJUST } from "../stores/extras-store";
import { useMediaStore } from "../stores/media-store";
import { useProjectionStore } from "../stores/projection-store";
import { mediaUrl } from "../lib/media-src";

const BANDS = [
  { label: "Dark", bg: "rgba(15,23,42,0.9)", fg: "#ffffff" },
  { label: "Teal", bg: "rgba(13,148,136,0.95)", fg: "#ffffff" },
  { label: "Gold", bg: "rgba(245,158,11,0.95)", fg: "#111827" },
  { label: "Red", bg: "rgba(220,38,38,0.95)", fg: "#ffffff" },
];

/** Live tools › Ticker: announcements that keep scrolling along the bottom, under the songs and verses. */
export function TickerTools() {
  const { ticker, setTicker } = useExtrasStore();
  const [text, setText] = useState(ticker.text);
  return (
    <div className="space-y-2.5">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
        placeholder="e.g. Welcome to Grace Baptist Church · Youth camp registration closes Sunday · Give via MoMo 024…"
        className="w-full resize-none rounded-lg border border-line-bright px-2.5 py-2 text-[13px]" style={{ userSelect: "text" }} />
      <div className="flex flex-wrap items-center gap-2">
        {BANDS.map((b) => (
          <button key={b.label} title={b.label} onClick={() => setTicker({ background: b.bg, color: b.fg })}
            className={`size-7 rounded-full ${ticker.background === b.bg ? "ring-2 ring-primary ring-offset-2" : "ring-1 ring-line"}`} style={{ background: b.bg }} />
        ))}
        <label className="ml-auto flex items-center gap-2 text-[13px] text-ink">
          Speed
          <input type="range" min={6} max={40} value={46 - ticker.seconds} onChange={(e) => setTicker({ seconds: 46 - Number(e.target.value) })} className="w-28 accent-[var(--color-primary)]" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setTicker({ text: text.trim(), on: true })} disabled={!text.trim()}
          className="h-10 rounded-lg bg-primary text-[13px] font-bold text-white hover:bg-primary-bright disabled:bg-surface-5 disabled:text-ink-faint">
          {ticker.on ? "Update ticker" : "Start ticker"}
        </button>
        <button onClick={() => setTicker({ on: false })} disabled={!ticker.on}
          className="h-10 rounded-lg border border-line-bright text-[13px] font-semibold text-ink hover:bg-surface-4 disabled:text-ink-faint">Stop ticker</button>
      </div>
      {ticker.on && <p className="truncate rounded-lg bg-primary-soft px-2.5 py-1.5 text-[12px] text-primary-bright">Scrolling: {ticker.text}</p>}
    </div>
  );
}

/** Live tools › Props: a corner logo or a lower-third title that stays on top of every slide. */
export function PropTools() {
  const { prop, setProp } = useExtrasStore();
  const items = useMediaStore((s) => s.items);
  const logo = useProjectionStore((s) => s.logo);
  const pictures = useMemo(() => items.filter((i) => i.kind === "image"), [items]);
  const [title, setTitle] = useState(prop.title ?? "");
  const [subtitle, setSubtitle] = useState(prop.subtitle ?? "");

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-4 p-1">
        {([["logo", "Corner logo"], ["lower-third", "Name / title"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setProp({ kind: k })} aria-pressed={prop.kind === k}
            className={`rounded-md py-1 text-[13px] ${prop.kind === k ? "bg-surface-2 font-semibold text-primary-bright shadow-sm" : "text-ink-muted"}`}>{l}</button>
        ))}
      </div>
      {prop.kind === "logo" ? (
        <>
          <div className="grid max-h-32 grid-cols-5 gap-1.5 overflow-y-auto">
            {(logo?.kind === "image" ? [{ id: "church-logo", path: logo.src, name: "Church logo" }] : []).concat(pictures.map((p) => ({ id: p.id, path: p.path, name: p.name }))).map((p) => (
              <button key={p.id} title={p.name} onClick={() => setProp({ image: p.path })}
                className={`aspect-square overflow-hidden rounded-md bg-surface-4 ${prop.image === p.path ? "ring-2 ring-primary" : "ring-1 ring-line"}`}>
                <img src={mediaUrl(p.path)} alt="" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
          {!pictures.length && !logo && <p className="text-[12px] text-ink-muted">Add your logo in Media first.</p>}
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
            <select value={prop.corner} onChange={(e) => setProp({ corner: e.target.value as typeof prop.corner })} className="h-8 rounded-md border border-line-bright bg-surface-2 px-1.5">
              <option value="top-right">Top right</option><option value="top-left">Top left</option>
              <option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option>
            </select>
            <label className="flex items-center gap-1.5">Size
              <input type="range" min={5} max={30} value={Math.round(prop.size * 100)} onChange={(e) => setProp({ size: Number(e.target.value) / 100 })} className="w-24 accent-[var(--color-primary)]" />
            </label>
          </div>
        </>
      ) : (
        <>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name, e.g. Rev. Kwame Mensah" className="h-9 w-full rounded-lg border border-line-bright px-2.5 text-[13px]" />
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Title, e.g. Senior Pastor" className="h-9 w-full rounded-lg border border-line-bright px-2.5 text-[13px]" />
        </>
      )}
      <label className="flex items-center gap-2 text-[13px] text-ink">See-through
        <input type="range" min={30} max={100} value={Math.round(prop.opacity * 100)} onChange={(e) => setProp({ opacity: Number(e.target.value) / 100 })} className="w-28 accent-[var(--color-primary)]" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setProp({ on: true, title: title.trim(), subtitle: subtitle.trim() })}
          disabled={prop.kind === "logo" ? !prop.image : !title.trim()}
          className="h-10 rounded-lg bg-primary text-[13px] font-bold text-white hover:bg-primary-bright disabled:bg-surface-5 disabled:text-ink-faint">{prop.on ? "Update" : "Show on top"}</button>
        <button onClick={() => setProp({ on: false })} disabled={!prop.on}
          className="h-10 rounded-lg border border-line-bright text-[13px] font-semibold text-ink hover:bg-surface-4 disabled:text-ink-faint">Take off</button>
      </div>
    </div>
  );
}

/** Settings › Screens: move, size and keystone the whole picture for an awkward projector or screen. */
export function OutputAdjust() {
  const { adjust, setAdjust } = useExtrasStore();
  const row = (label: string, key: keyof typeof adjust, min: number, max: number, step: number, unit: string) => (
    <label className="grid grid-cols-[110px_minmax(0,1fr)_56px] items-center gap-3 text-[13px] text-ink">
      {label}
      <input type="range" min={min} max={max} step={step} value={adjust[key]} onChange={(e) => setAdjust({ [key]: Number(e.target.value) })} className="accent-[var(--color-primary)]" />
      <span className="text-right tabular-nums text-ink-muted">{key === "scale" ? `${Math.round(adjust.scale * 100)}%` : `${adjust[key]}${unit}`}</span>
    </label>
  );
  return (
    <div className="space-y-2.5">
      <p className="text-[13px] text-ink-muted">For a projector that isn't straight or a screen that cuts the edges. Changes show on the projector straight away.</p>
      {row("Move left/right", "x", -20, 20, 0.5, "%")}
      {row("Move up/down", "y", -20, 20, 0.5, "%")}
      {row("Size", "scale", 0.7, 1.2, 0.01, "")}
      {row("Keystone (top/bottom)", "keystone", -15, 15, 0.5, "°")}
      {row("Keystone (sides)", "tilt", -15, 15, 0.5, "°")}
      <button onClick={() => setAdjust(DEFAULT_ADJUST)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-primary-bright hover:bg-primary-soft">
        <RotateCcw className="size-4" /> Put it back to normal
      </button>
    </div>
  );
}
