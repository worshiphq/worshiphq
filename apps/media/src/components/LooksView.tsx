import { useMemo, useState, type ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight, Copy, Film, Image as ImageIcon, MonitorPlay, RotateCcw } from "lucide-react";
import { useThemeStore } from "../stores/theme-store";
import { useMediaStore } from "../stores/media-store";
import { useProjectionStore } from "../stores/projection-store";
import { FONTS, GRADIENTS, THEME_LABELS, TRANSITIONS, type ThemeKind } from "../lib/themes";
import { mediaUrl, isDesktopApp } from "../lib/media-src";
import type { Slide } from "../types";
import { ScaledSlide } from "./SlideCanvas";

const SAMPLES: Record<ThemeKind, Slide> = {
  song: {
    type: "song", label: "Chorus",
    content: { primaryText: "Bless the Lord, O my soul\nO my soul\nWorship His holy name\nSing like never before" },
    template: { background: "#000", textLayout: "center" },
  },
  scripture: {
    type: "scripture", label: "John 3:16",
    content: { primaryText: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.", secondaryText: "John 3:16 · KJV" },
    template: { background: "#000", textLayout: "center" },
  },
  announcement: {
    type: "announcement", label: "Announcement",
    content: { primaryText: "Youth Camp 2026", secondaryText: "Register at the welcome desk before Sunday" },
    template: { background: "#000", textLayout: "center" },
  },
};

const WEIGHTS = [[400, "Normal"], [600, "Semi-bold"], [700, "Bold"], [800, "Extra bold"], [900, "Black"]] as const;

export function LooksView() {
  const { themes, update, updateBackground, updateSub, reset, copyTo, transition, setTransition } = useThemeStore();
  const mediaItems = useMediaStore((s) => s.items);
  const { goLive, projectionOpen, openProjection } = useProjectionStore();
  const [kind, setKind] = useState<ThemeKind>("song");
  const [copied, setCopied] = useState(false);
  const st = themes[kind];
  const sample = useMemo(() => ({ ...SAMPLES[kind] }), [kind]);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
      {/* ─── Preview ─── */}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <section className="rounded-xl border border-line bg-surface-2 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="flex-1">
              <h2 className="text-[18px] font-bold text-ink">Look &amp; fonts</h2>
              <p className="text-[14px] text-ink-muted">How words look on the projector. Changes show straight away, even on what is live.</p>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-1 rounded-lg bg-surface-4 p-1">
            {(Object.keys(THEME_LABELS) as ThemeKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={`flex-1 rounded-md px-3 py-2 text-[14px] font-medium ${kind === k ? "bg-surface-2 font-semibold text-primary-bright shadow-sm" : "text-ink-muted hover:text-ink"}`}
              >
                {THEME_LABELS[k]}
              </button>
            ))}
          </div>
          <ScaledSlide slide={sample} live className="rounded-xl ring-1 ring-line-bright" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => { if (isDesktopApp() && !projectionOpen) openProjection(); goLive(sample); }}
              className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[14px] font-bold text-white hover:bg-primary-bright"
            >
              <MonitorPlay className="size-4" /> Show this sample on the projector
            </button>
            <button
              onClick={() => { copyTo(kind, (Object.keys(THEME_LABELS) as ThemeKind[]).filter((k) => k !== kind)); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="flex h-10 items-center gap-2 rounded-lg border border-line-bright px-3 text-[14px] font-semibold text-ink hover:bg-surface-4"
            >
              <Copy className="size-4" /> {copied ? "Copied to the others ✓" : "Use this look for everything"}
            </button>
            <button onClick={() => reset(kind)} className="ml-auto flex h-10 items-center gap-2 rounded-lg px-3 text-[14px] font-semibold text-ink-muted hover:bg-surface-4 hover:text-ink">
              <RotateCcw className="size-4" /> Reset {THEME_LABELS[kind].toLowerCase()}
            </button>
          </div>
        </section>

        {/* Transitions */}
        <section className="rounded-xl border border-line bg-surface-2 p-4 shadow-sm">
          <h3 className="mb-1 text-[15px] font-semibold text-ink">Transitions</h3>
          <p className="mb-3 text-[13px] text-ink-muted">How the projector changes from one slide to the next, and when you clear or bring back the words. If the background stays the same, only the words change.</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {TRANSITIONS.map((t) => (
              <button key={t.id} onClick={() => setTransition({ kind: t.id })} aria-pressed={transition.kind === t.id}
                className={`rounded-lg p-3 text-left ${transition.kind === t.id ? "bg-primary-soft ring-2 ring-primary" : "bg-surface-4 hover:bg-surface-5"}`}>
                <span className="block text-[14px] font-semibold text-ink">{t.label}{t.id === "dissolve" ? " (recommended)" : ""}</span>
                <span className="block text-[12px] text-ink-muted">{t.detail}</span>
              </button>
            ))}
          </div>
          {transition.kind !== "cut" && (
            <label className="mt-3 block">
              <div className="mb-1 flex items-center justify-between text-[13px] font-medium text-ink-muted"><span>Speed</span><span className="font-semibold text-ink">{(transition.ms / 1000).toFixed(2)} s</span></div>
              <input type="range" min={150} max={2000} step={50} value={transition.ms} onChange={(e) => setTransition({ ms: Number(e.target.value) })} className="w-full accent-[var(--color-primary)]" />
            </label>
          )}
        </section>

        {/* Background */}
        <section className="rounded-xl border border-line bg-surface-2 p-4 shadow-sm">
          <h3 className="mb-3 text-[15px] font-semibold text-ink">Background</h3>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-9">
            {GRADIENTS.map((g) => {
              const on = (st.background.kind === "color" || st.background.kind === "gradient") && st.background.value === g.value;
              return (
                <button
                  key={g.value}
                  title={g.label}
                  onClick={() => updateBackground(kind, { kind: "gradient", value: g.value })}
                  className={`h-12 rounded-lg ring-offset-2 ${on ? "ring-2 ring-primary" : "ring-1 ring-line-bright hover:opacity-90"}`}
                  style={{ background: g.value }}
                />
              );
            })}
          </div>
          <label className="mt-3 flex items-center gap-2 text-[14px] text-ink">
            Your own colour
            <input
              type="color"
              value={st.background.kind === "color" && st.background.value.startsWith("#") ? st.background.value : "#000000"}
              onChange={(e) => updateBackground(kind, { kind: "color", value: e.target.value })}
              className="h-9 w-14 cursor-pointer rounded border border-line-bright"
            />
          </label>

          <div className="mt-4">
            <div className="mb-2 text-[14px] font-medium text-ink">Or a picture / moving video from your library</div>
            {mediaItems.length === 0 ? (
              <p className="text-[13px] text-ink-muted">Add pictures or videos in Pictures &amp; videos first, then pick one here.</p>
            ) : (
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
                {mediaItems.filter((m) => m.kind !== "audio").map((m) => {
                  const on = (st.background.kind === "image" || st.background.kind === "video") && st.background.value === m.path;
                  return (
                    <button
                      key={m.id}
                      onClick={() => updateBackground(kind, { kind: m.kind === "video" ? "video" : "image", value: m.path })}
                      title={m.name}
                      className={`relative aspect-video overflow-hidden rounded-md bg-black ${on ? "ring-2 ring-primary ring-offset-2" : "ring-1 ring-line hover:opacity-90"}`}
                    >
                      {m.kind === "image"
                        ? <img src={mediaUrl(m.path)} alt="" className="h-full w-full object-cover" />
                        : <video src={mediaUrl(m.path) + "#t=1"} muted preload="metadata" className="h-full w-full object-cover" />}
                      <span className="absolute bottom-1 left-1 grid size-5 place-items-center rounded bg-black/60 text-white">
                        {m.kind === "video" ? <Film className="size-3" /> : <ImageIcon className="size-3" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {(st.background.kind === "image" || st.background.kind === "video") && (
              <Slider label="Darken the picture so words stand out" value={st.background.dim} min={0} max={0.85} step={0.05} show={`${Math.round(st.background.dim * 100)}%`} onChange={(v) => updateBackground(kind, { dim: v })} />
            )}
          </div>
        </section>
      </div>

      {/* ─── Controls ─── */}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <Card title="Words">
          <Field label="Font">
            <select
              value={st.fontFamily}
              onChange={(e) => update(kind, { fontFamily: e.target.value })}
              className="h-10 w-full rounded-lg border border-line-bright bg-surface-2 px-2 text-[14px] text-ink outline-none focus:border-primary"
            >
              {FONTS.map((f) => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="Thickness">
            <Segments value={st.fontWeight} options={WEIGHTS.map(([v, l]) => [v, l])} onChange={(v) => update(kind, { fontWeight: Number(v) })} />
          </Field>
          <Slider label="Size" value={st.fontSize} min={40} max={180} step={2} show={`${st.fontSize}`} onChange={(v) => update(kind, { fontSize: v })} />
          <Toggle label="Shrink long text so it always fits the screen" checked={st.shrinkToFit} onChange={(v) => update(kind, { shrinkToFit: v })} />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <ColorField label="Colour" value={st.color} onChange={(v) => update(kind, { color: v })} />
            <Toggle label="CAPITALS" checked={st.uppercase} onChange={(v) => update(kind, { uppercase: v })} />
            <Toggle label="Italic" checked={st.italic} onChange={(v) => update(kind, { italic: v })} />
          </div>
        </Card>

        <Card title="Position & spacing">
          <Field label="Where on the screen">
            <Segments value={st.position} options={[["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"], ["lower-third", "Lower third"]]} onChange={(v) => update(kind, { position: v as typeof st.position })} />
          </Field>
          <Field label="Line up the words">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-4 p-1">
              {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([v, Icon]) => (
                <button key={v} onClick={() => update(kind, { align: v })} aria-pressed={st.align === v} aria-label={v}
                  className={`grid h-8 place-items-center rounded-md ${st.align === v ? "bg-surface-2 text-primary-bright shadow-sm" : "text-ink-muted hover:text-ink"}`}>
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          </Field>
          <Slider label="Line spacing" value={st.lineHeight} min={0.9} max={2} step={0.05} show={st.lineHeight.toFixed(2)} onChange={(v) => update(kind, { lineHeight: v })} />
          <Slider label="Letter spacing" value={st.letterSpacing} min={-0.05} max={0.2} step={0.01} show={st.letterSpacing.toFixed(2)} onChange={(v) => update(kind, { letterSpacing: v })} />
          <Slider label="Space around the edges" value={st.margin} min={0.02} max={0.2} step={0.01} show={`${Math.round(st.margin * 100)}%`} onChange={(v) => update(kind, { margin: v })} />
        </Card>

        <Card title="Easy to read">
          <Field label="Shadow behind the words">
            <Segments value={st.shadow} options={[["none", "None"], ["soft", "Soft"], ["strong", "Strong"]]} onChange={(v) => update(kind, { shadow: v as typeof st.shadow })} />
          </Field>
          <Slider label="Outline around letters" value={st.outlineWidth} min={0} max={8} step={1} show={st.outlineWidth ? `${st.outlineWidth}px` : "Off"} onChange={(v) => update(kind, { outlineWidth: v })} />
          {st.outlineWidth > 0 && <ColorField label="Outline colour" value={st.outlineColor} onChange={(v) => update(kind, { outlineColor: v })} />}
        </Card>

        <Card title={kind === "scripture" ? "Bible reference (e.g. John 3:16 · KJV)" : kind === "announcement" ? "Second line (the message)" : "Second line"}>
          <Toggle label="Show it" checked={st.sub.show} onChange={(v) => updateSub(kind, { show: v })} />
          {st.sub.show && (
            <>
              <Slider label="Size" value={st.sub.size} min={20} max={110} step={2} show={`${st.sub.size}`} onChange={(v) => updateSub(kind, { size: v })} />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <ColorField label="Colour" value={st.sub.color} onChange={(v) => updateSub(kind, { color: v })} />
                <Toggle label="CAPITALS" checked={st.sub.uppercase} onChange={(v) => updateSub(kind, { uppercase: v })} />
              </div>
              <Field label="Place it">
                <Segments value={st.sub.position} options={[["below", "Under the words"], ["above", "Above the words"]]} onChange={(v) => updateSub(kind, { position: v as "below" | "above" })} />
              </Field>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ─────────────────────────── Controls ─────────────────────────── */

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface-2 p-4 shadow-sm">
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-medium text-ink-muted">{label}</div>
      {children}
    </div>
  );
}

function Segments({ value, options, onChange }: { value: string | number; options: (readonly [string | number, string])[]; onChange: (v: string | number) => void }) {
  return (
    <div className="grid gap-1 rounded-lg bg-surface-4 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(([v, l]) => (
        <button key={String(v)} onClick={() => onChange(v)} aria-pressed={value === v}
          className={`rounded-md px-1 py-1.5 text-[12px] font-medium ${value === v ? "bg-surface-2 font-semibold text-primary-bright shadow-sm" : "text-ink-muted hover:text-ink"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, step, show, onChange }: { label: string; value: number; min: number; max: number; step: number; show: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-[13px] font-medium text-ink-muted">
        <span>{label}</span><span className="font-semibold text-ink">{show}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[14px] text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
      {label}
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-[14px] text-ink">
      {label}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-line-bright" />
    </label>
  );
}
