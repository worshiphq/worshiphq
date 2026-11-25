import { ask, dialogOpen } from "./Dialogs";
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { ArrowDown, ArrowUp, Copy, Image as ImageIcon, Plus, Square, Trash2, Type, X } from "lucide-react";
import type { Slide, SlideElement } from "../types";
import { blankSlide, newElement, type Deck } from "../stores/deck-store";
import { useMediaStore } from "../stores/media-store";
import { FONTS, GRADIENTS } from "../lib/themes";
import { mediaUrl } from "../lib/media-src";
import { CANVAS_H, CANVAS_W, ElementView, ScaledSlide } from "./SlideCanvas";

const COLOURS = ["#ffffff", "#000000", "#facc15", "#f59e0b", "#ef4444", "#ec4899", "#a855f7", "#3b82f6", "#22d3ee", "#22c55e", "#0d9488", "#1e293b"];
const FILLS = ["rgba(13,148,136,0.85)", "rgba(15,23,42,0.75)", "rgba(0,0,0,0.5)", "rgba(255,255,255,0.15)", "rgba(220,38,38,0.85)", "rgba(245,158,11,0.9)", "rgba(59,130,246,0.85)"];

/**
 * Design your own slides: text boxes, pictures and shapes placed anywhere. Drag to move, drag the corner to resize,
 * and change the selected item on the right. Like PowerPoint, made simple.
 */
export function SlideEditor({ deck, onSave, onClose }: { deck: Deck; onSave: (d: Deck) => void; onClose: () => void }) {
  const [title, setTitle] = useState(deck.title);
  const [slides, setSlides] = useState<Slide[]>(deck.slides.length ? deck.slides : [blankSlide()]);
  const [at, setAt] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [picking, setPicking] = useState<"image" | "background" | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const media = useMediaStore((s) => s.items);
  const pictures = useMemo(() => media.filter((m) => m.kind === "image" || m.kind === "video"), [media]);

  const slide = slides[at] ?? slides[0];
  const els = slide.elements ?? [];
  const chosen = els.find((e) => e.id === sel) ?? null;

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(el.clientWidth / CANVAS_W, el.clientHeight / CANVAS_H)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function setSlide(changes: Partial<Slide>) {
    setSlides((all) => all.map((s, i) => (i === at ? { ...s, ...changes } : s)));
    setDirty(true);
  }
  function setEl(id: string, changes: Partial<SlideElement>) {
    setSlide({ elements: els.map((e) => (e.id === id ? { ...e, ...changes } : e)) });
  }
  function add(kind: SlideElement["kind"], over: Partial<SlideElement> = {}) {
    const e = newElement(kind, over);
    setSlide({ elements: [...els, e] });
    setSel(e.id);
  }
  function move(id: string, dir: 1 | -1) {
    const i = els.findIndex((e) => e.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= els.length) return;
    const next = [...els];
    [next[i], next[j]] = [next[j], next[i]];
    setSlide({ elements: next });
  }

  // Drag to move, drag the corner handle to resize (in projector pixels).
  function drag(e: RPointerEvent, el: SlideElement, mode: "move" | "size") {
    e.stopPropagation();
    e.preventDefault();
    setSel(el.id);
    const sx = e.clientX, sy = e.clientY, start = { ...el };
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
      const snap = (v: number) => Math.round(v / 10) * 10;
      if (mode === "move") setEl(el.id, { x: snap(start.x + dx), y: snap(start.y + dy) });
      else setEl(el.id, { w: Math.max(40, snap(start.w + dx)), h: Math.max(30, snap(start.h + dy)) });
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); setSlide({ elements: els.filter((x) => x.id !== sel) }); setSel(null); }
      if (e.key === "Escape") { e.stopImmediatePropagation(); if (sel) setSel(null); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  function save(close: boolean) {
    onSave({ ...deck, title: title.trim() || "Slides", slides: slides.map((s, i) => ({ ...s, label: s.label && s.label !== "Slide" ? s.label : `Slide ${i + 1}` })) });
    setDirty(false);
    if (close) onClose();
  }
  async function close() {
    if (dialogOpen()) return;
    if (dirty && !(await ask("Close without saving your changes?", "Close without saving", { danger: true, no: "Keep editing" }))) return;
    onClose();
  }

  const bg = slide.background;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-3 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" aria-label="Slide editor" className="flex h-[min(900px,97vh)] w-[min(1400px,99vw)] flex-col overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-[0_30px_80px_rgba(15,23,42,0.35)]">
        {/* Top: name + tools */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} placeholder="Name, e.g. Sunday announcements"
            className="h-10 w-72 rounded-lg border border-line-bright px-3 text-[16px] font-bold text-ink" />
          <span className="mx-1 h-6 w-px bg-line" />
          <Tool onClick={() => add("text")} icon={<Type className="size-4" />} label="Text" />
          <Tool onClick={() => setPicking("image")} icon={<ImageIcon className="size-4" />} label="Picture" />
          <Tool onClick={() => add("shape")} icon={<Square className="size-4" />} label="Shape / band" />
          <span className="mx-1 h-6 w-px bg-line" />
          <Tool onClick={() => setPicking("background")} icon={<ImageIcon className="size-4" />} label="Background" />
          <button onClick={close} aria-label="Close" className="ml-auto grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-4"><X className="size-5" /></button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[150px_minmax(0,1fr)_280px]">
          {/* Slides in this set */}
          <div className="min-h-0 overflow-y-auto border-r border-line p-2">
            {slides.map((s, i) => (
              <div key={i} className={`group relative mb-2 cursor-pointer rounded-md p-1 ${i === at ? "bg-primary-soft ring-2 ring-primary" : "hover:bg-surface-4"}`} onClick={() => { setAt(i); setSel(null); }}>
                <ScaledSlide slide={s} />
                <span className="absolute left-2 top-2 rounded bg-black/60 px-1 text-[10px] font-bold text-white">{i + 1}</span>
                <span className="absolute right-1.5 top-1.5 hidden gap-0.5 group-hover:flex">
                  <button title="Copy this slide" onClick={(e) => { e.stopPropagation(); const c = JSON.parse(JSON.stringify(s)) as Slide; c.elements = c.elements?.map((x) => ({ ...x, id: crypto.randomUUID() })); setSlides((a) => [...a.slice(0, i + 1), c, ...a.slice(i + 1)]); setDirty(true); }} className="grid size-5 place-items-center rounded bg-black/60 text-white"><Copy className="size-3" /></button>
                  {slides.length > 1 && <button title="Delete this slide" onClick={(e) => { e.stopPropagation(); setSlides((a) => a.filter((_, k) => k !== i)); setAt(Math.max(0, Math.min(at, slides.length - 2))); setDirty(true); }} className="grid size-5 place-items-center rounded bg-black/60 text-white"><Trash2 className="size-3" /></button>}
                </span>
              </div>
            ))}
            <button onClick={() => { setSlides((a) => [...a, blankSlide()]); setAt(slides.length); setDirty(true); }} className="flex w-full items-center justify-center gap-1 rounded-md border-2 border-dashed border-line-bright py-3 text-[12px] font-semibold text-ink-muted hover:border-primary hover:text-primary-bright">
              <Plus className="size-4" /> Add a slide
            </button>
          </div>

          {/* The slide, at projector size scaled down; items can be dragged and resized */}
          <div ref={stage} className="relative min-h-0 bg-surface-4/60 p-4" onPointerDown={() => setSel(null)}>
            <div className="absolute left-1/2 top-1/2" style={{ width: CANVAS_W * scale, height: CANVAS_H * scale, transform: "translate(-50%, -50%)" }}>
              <div style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${scale})`, transformOrigin: "top left", position: "relative" }}>
                <ScaledSlide slide={{ ...slide, elements: [] }} className="absolute inset-0" />
                {els.map((el) => (
                  <div key={el.id} onPointerDown={(e) => drag(e, el, "move")}
                    style={{ position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h, cursor: "move", outline: sel === el.id ? `${3 / scale}px solid #0d9488` : `${1 / scale}px dashed rgba(255,255,255,0.35)` }}>
                    <EditorElement el={el} />
                    {sel === el.id && (
                      <div onPointerDown={(e) => drag(e, el, "size")} title="Drag to resize"
                        style={{ position: "absolute", right: -10 / scale, bottom: -10 / scale, width: 20 / scale, height: 20 / scale, background: "#0d9488", borderRadius: 4 / scale, cursor: "nwse-resize" }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* The selected item */}
          <div className="min-h-0 space-y-3 overflow-y-auto border-l border-line p-3 text-[13px]">
            {!chosen ? (
              <p className="text-ink-muted">Click an item on the slide to change it, or add <b>Text</b>, a <b>Picture</b> or a <b>Shape</b> from the top. Drag items to move them; drag the green corner to resize.</p>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <span className="flex-1 font-bold text-ink">{chosen.kind === "text" ? "Text" : chosen.kind === "image" ? "Picture" : "Shape"}</span>
                  <button title="Bring forward" onClick={() => move(chosen.id, 1)} className="grid size-7 place-items-center rounded hover:bg-surface-4"><ArrowUp className="size-4" /></button>
                  <button title="Send back" onClick={() => move(chosen.id, -1)} className="grid size-7 place-items-center rounded hover:bg-surface-4"><ArrowDown className="size-4" /></button>
                  <button title="Delete (Del)" onClick={() => { setSlide({ elements: els.filter((x) => x.id !== chosen.id) }); setSel(null); }} className="grid size-7 place-items-center rounded text-danger hover:bg-danger/10"><Trash2 className="size-4" /></button>
                </div>
                {chosen.kind === "text" && (
                  <>
                    <textarea value={chosen.text ?? ""} onChange={(e) => setEl(chosen.id, { text: e.target.value })} rows={4} className="w-full resize-none rounded-lg border border-line-bright p-2 text-[14px]" style={{ userSelect: "text" }} />
                    <select value={chosen.font ?? ""} onChange={(e) => setEl(chosen.id, { font: e.target.value || undefined })} className="h-9 w-full rounded-lg border border-line-bright bg-surface-2 px-2">
                      <option value="">Segoe UI</option>
                      {FONTS.map((f) => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
                    </select>
                    <label className="flex items-center gap-2">Size
                      <input type="range" min={24} max={260} value={chosen.size ?? 72} onChange={(e) => setEl(chosen.id, { size: Number(e.target.value) })} className="flex-1 accent-[var(--color-primary)]" />
                      <span className="w-8 text-right">{chosen.size ?? 72}</span>
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {(["left", "center", "right"] as const).map((a) => (
                        <button key={a} onClick={() => setEl(chosen.id, { align: a })} className={`rounded-md px-2 py-1 ${chosen.align === a ? "bg-primary text-white" : "bg-surface-4"}`}>{a === "left" ? "Left" : a === "center" ? "Centre" : "Right"}</button>
                      ))}
                      <button onClick={() => setEl(chosen.id, { bold: !chosen.bold })} className={`rounded-md px-2 py-1 font-bold ${chosen.bold ? "bg-primary text-white" : "bg-surface-4"}`}>B</button>
                      <button onClick={() => setEl(chosen.id, { italic: !chosen.italic })} className={`rounded-md px-2 py-1 italic ${chosen.italic ? "bg-primary text-white" : "bg-surface-4"}`}>I</button>
                      <button onClick={() => setEl(chosen.id, { shadow: chosen.shadow === false })} className={`rounded-md px-2 py-1 ${chosen.shadow !== false ? "bg-primary text-white" : "bg-surface-4"}`}>Shadow</button>
                    </div>
                    <Swatches label="Colour" value={chosen.color} options={COLOURS} onPick={(c) => setEl(chosen.id, { color: c })} />
                    <Swatches label="Box behind the text" value={chosen.fill} options={["", ...FILLS]} onPick={(c) => setEl(chosen.id, { fill: c || undefined })} />
                  </>
                )}
                {chosen.kind === "shape" && <Swatches label="Colour" value={chosen.fill} options={[...FILLS, ...COLOURS]} onPick={(c) => setEl(chosen.id, { fill: c })} />}
                {chosen.kind === "image" && (
                  <>
                    <button onClick={() => setPicking("image")} className="h-9 w-full rounded-lg border border-line-bright font-semibold hover:bg-surface-4">Change picture</button>
                    <div className="flex gap-1">
                      {(["contain", "cover"] as const).map((f) => (
                        <button key={f} onClick={() => setEl(chosen.id, { fit: f })} className={`flex-1 rounded-md px-2 py-1 ${chosen.fit === f ? "bg-primary text-white" : "bg-surface-4"}`}>{f === "contain" ? "Whole picture" : "Fill the box"}</button>
                      ))}
                    </div>
                  </>
                )}
                {(chosen.kind !== "text" || chosen.fill) && (
                  <label className="flex items-center gap-2">Rounded corners
                    <input type="range" min={0} max={120} value={chosen.radius ?? 0} onChange={(e) => setEl(chosen.id, { radius: Number(e.target.value) })} className="flex-1 accent-[var(--color-primary)]" />
                  </label>
                )}
                <label className="flex items-center gap-2">See-through
                  <input type="range" min={10} max={100} value={Math.round((chosen.opacity ?? 1) * 100)} onChange={(e) => setEl(chosen.id, { opacity: Number(e.target.value) / 100 })} className="flex-1 accent-[var(--color-primary)]" />
                </label>
                <button onClick={() => setEl(chosen.id, chosen.kind === "shape" ? { x: 0, w: CANVAS_W } : { x: Math.round((CANVAS_W - chosen.w) / 2) })}
                  className="h-8 w-full rounded-lg bg-surface-4 font-semibold hover:bg-surface-5">{chosen.kind === "shape" ? "Stretch across the screen" : "Centre across the screen"}</button>
              </>
            )}
            <div className="border-t border-line pt-3">
              <span className="mb-1 block font-semibold text-ink">This slide's background</span>
              <p className="mb-1.5 text-[12px] text-ink-muted">{bg ? "Its own background (picked above)." : "Uses the announcement look from Look & fonts."}</p>
              {bg && <button onClick={() => setSlide({ background: undefined })} className="text-[12px] font-semibold text-primary-bright hover:underline">Use the look's background again</button>}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface-4/40 px-4 py-3">
          <span className="text-[12px] text-ink-faint">Del removes the selected item · Esc unselects</span>
          <div className="ml-auto flex gap-2">
            <button onClick={close} className="h-10 rounded-lg border border-line-bright px-4 text-[14px] font-semibold text-ink hover:bg-surface-4">Cancel</button>
            <button onClick={() => save(true)} className="h-10 rounded-lg bg-primary px-6 text-[14px] font-bold text-white hover:bg-primary-bright">Save</button>
          </div>
        </div>

        {picking && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-ink/30" onClick={() => setPicking(null)}>
            <div onClick={(e) => e.stopPropagation()} className="max-h-[70vh] w-[min(640px,92vw)] overflow-y-auto rounded-xl border border-line bg-surface-2 p-4 shadow-xl">
              <div className="mb-2 flex items-center"><b className="flex-1 text-ink">{picking === "image" ? "Choose a picture" : "Choose the background"}</b><button onClick={() => setPicking(null)}><X className="size-5" /></button></div>
              {picking === "background" && (
                <div className="mb-3 grid grid-cols-5 gap-2">
                  {GRADIENTS.map((g) => <button key={g.value} title={g.label} onClick={() => { setSlide({ background: { kind: g.value.startsWith("#") ? "color" : "gradient", value: g.value } }); setPicking(null); }} className="aspect-video rounded-md ring-1 ring-line" style={{ background: g.value }} />)}
                </div>
              )}
              <div className="grid grid-cols-4 gap-2">
                {pictures.filter((p) => picking === "background" || p.kind === "image").map((p) => (
                  <button key={p.id} title={p.name} onClick={() => {
                    if (picking === "image") {
                      if (chosen?.kind === "image") setEl(chosen.id, { src: p.path }); else add("image", { src: p.path });
                    } else setSlide({ background: { kind: p.kind === "video" ? "video" : "image", value: p.path } });
                    setPicking(null);
                  }} className="aspect-video overflow-hidden rounded-md ring-1 ring-line hover:ring-2 hover:ring-primary">
                    {p.kind === "video" ? <video src={mediaUrl(p.path) + "#t=1"} muted className="h-full w-full object-cover" /> : <img src={mediaUrl(p.path)} alt="" className="h-full w-full object-cover" />}
                  </button>
                ))}
              </div>
              {!pictures.length && <p className="text-[13px] text-ink-muted">Add pictures in Media first.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** In the editor the item is drawn exactly as on the projector. */
function EditorElement({ el }: { el: SlideElement }) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <ElementView el={{ ...el, x: 0, y: 0 }} />
    </div>
  );
}

function Tool({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className="flex h-9 items-center gap-1.5 rounded-lg border border-line-bright px-3 text-[13px] font-semibold text-ink hover:bg-surface-4">{icon} {label}</button>
  );
}

function Swatches({ label, value, options, onPick }: { label: string; value?: string; options: string[]; onPick: (c: string) => void }) {
  return (
    <div>
      <span className="mb-1 block text-ink-muted">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((c) => (
          <button key={c || "none"} onClick={() => onPick(c)} title={c || "None"}
            className={`size-6 rounded-full ring-1 ring-black/20 ${value === c || (!value && !c) ? "ring-2 ring-primary ring-offset-1" : ""}`}
            style={{ background: c || "repeating-linear-gradient(45deg,#fff 0 4px,#e2e8f0 4px 8px)" }} />
        ))}
      </div>
    </div>
  );
}
