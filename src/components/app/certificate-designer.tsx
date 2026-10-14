"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Upload, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { saveCertificateTemplate, type CertField, type TemplateRow } from "@/app/actions/baptisms";
import { SAMPLE, type CertCtx } from "@/components/app/certificate";
import { cn } from "@/lib/utils";

const FONTS = ["Cormorant Garamond", "Cinzel", "Playfair Display", "Great Vibes", "Montserrat", "Libre Baskerville", "EB Garamond", "Inter"];
const LABELS: Record<string, string> = { name: "Name", date: "Date", place: "Place", officiant: "Officiant", certificateNo: "Certificate number", church: "Church name" };
const PX_PER_MM = 96 / 25.4;
const DEFAULTS: CertField[] = [
  { key: "name", x: 10, y: 48, w: 80, size: 40, font: "Great Vibes", color: "#1b2a41", align: "center" },
  { key: "date", x: 12, y: 74, w: 30, size: 15, font: "Cormorant Garamond", color: "#1c1a16", align: "center" },
  { key: "place", x: 40, y: 74, w: 30, size: 15, font: "Cormorant Garamond", color: "#1c1a16", align: "center" },
  { key: "officiant", x: 12, y: 86, w: 40, size: 14, font: "Cormorant Garamond", color: "#1c1a16", align: "left" },
];

/** Shrink a big photo or scan so it saves quickly and prints sharp enough (up to about 300 dpi on A4). */
async function prepare(file: File): Promise<string> {
  const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const max = 3300;
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.88);
}

/** Upload a picture of your own blank certificate, then drag the name, date and place to where they belong. */
export function CertificateDesigner({ ctx, existing, onClose, onSaved }: { ctx: CertCtx; existing: TemplateRow | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState(existing?.name ?? "");
  const [paper, setPaper] = useState(existing?.paper ?? "a4-landscape");
  const [image, setImage] = useState<string | null>(existing?.imageUrl ?? null);
  const [dirtyImage, setDirtyImage] = useState(false);
  const [fields, setFields] = useState<CertField[]>(existing?.fields?.length ? existing.fields : DEFAULTS);
  const [sel, setSel] = useState<string>("name");
  const [busy, setBusy] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const drag = useRef<{ key: string; dx: number; dy: number } | null>(null);
  const [scale, setScale] = useState(0.5);
  const portrait = paper === "a4-portrait";
  const W = (portrait ? 210 : 297) * PX_PER_MM, H = (portrait ? 297 : 210) * PX_PER_MM;

  useLayoutEffect(() => {
    const el = holder.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W]);

  const values: Record<string, string> = { name: SAMPLE.name, date: SAMPLE.date, place: SAMPLE.place, officiant: SAMPLE.officiant, certificateNo: SAMPLE.certificateNo, church: ctx.churchName };
  const cur = fields.find((f) => f.key === sel) ?? null;
  const patch = (key: string, p: Partial<CertField>) => setFields((fs) => fs.map((f) => (f.key === key ? { ...f, ...p } : f)));

  function down(e: React.PointerEvent, f: CertField) {
    e.preventDefault();
    setSel(f.key);
    const r = stage.current!.getBoundingClientRect();
    drag.current = { key: f.key, dx: ((e.clientX - r.left) / r.width) * 100 - f.x, dy: ((e.clientY - r.top) / r.height) * 100 - f.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const r = stage.current!.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100 - d.dx));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100 - d.dy));
    patch(d.key, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    try { setImage(await prepare(file)); setDirtyImage(true); } catch { toast("We could not read that picture. Try a PNG or JPG.", "error"); }
  }

  async function save() {
    setBusy(true);
    const r = await saveCertificateTemplate({ id: existing?.id, name, imageDataUrl: dirtyImage || !existing ? image ?? undefined : undefined, paper, fields });
    setBusy(false);
    if (r.ok) { toast("Design saved.", "success"); onSaved(); } else toast(r.error, "error");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">Upload a picture of your blank certificate (a scan, or a PDF saved as an image). Then drag the name, date and place to where they belong, and choose the font. Every certificate you print uses this design.</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div><Label>Name of this design</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Our certificate" /></div>
        <div>
          <Label>Paper</Label>
          <select value={paper} onChange={(e) => setPaper(e.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3 text-sm">
            <option value="a4-landscape">A4 landscape</option>
            <option value="a4-portrait">A4 portrait</option>
          </select>
        </div>
        <div className="self-end">
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface-2">
            <Upload className="size-4" /> {image ? "Change picture" : "Upload picture"}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      {!image ? (
        <div className="grid place-items-center rounded-xl border-2 border-dashed border-line p-10 text-sm text-ink-faint">Upload your certificate picture to start placing the details.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_15rem]">
          <div ref={holder} className="w-full overflow-hidden rounded-lg border border-line bg-surface-2" style={{ height: H * scale }}>
            <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left", position: "relative" }}>
              <div ref={stage} style={{ position: "absolute", inset: 0 }} onPointerMove={move} onPointerUp={() => { drag.current = null; }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", userSelect: "none" }} />
                {fields.map((f) => (
                  <div
                    key={f.key}
                    onPointerDown={(e) => down(e, f)}
                    style={{
                      position: "absolute", left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, transform: "translateY(-50%)", textAlign: f.align, cursor: "grab", touchAction: "none",
                      fontFamily: `'${f.font}', serif`, fontSize: `${f.size}pt`, color: f.color, fontWeight: f.bold ? 600 : 400, lineHeight: 1.15, whiteSpace: "nowrap",
                      outline: f.key === sel ? "2px dashed #6c5ce7" : "1px dashed rgba(108,92,231,.45)", background: f.key === sel ? "rgba(108,92,231,.08)" : "transparent",
                    }}
                  >
                    {values[f.key]}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">What to print</div>
              {Object.keys(LABELS).map((k) => {
                const on = fields.some((f) => f.key === k);
                return (
                  <label key={k} className="flex items-center gap-2 py-0.5">
                    <input type="checkbox" checked={on} className="size-4 accent-primary" onChange={() => {
                      if (on) { setFields((fs) => fs.filter((f) => f.key !== k)); if (sel === k) setSel(""); }
                      else { setFields((fs) => [...fs, { key: k, x: 20, y: 60, w: 40, size: 16, font: "Cormorant Garamond", color: "#1c1a16", align: "center" }]); setSel(k); }
                    }} />
                    <button type="button" className={cn("text-left", sel === k && "font-semibold text-primary")} onClick={() => on && setSel(k)}>{LABELS[k]}</button>
                  </label>
                );
              })}
            </div>
            {cur && (
              <div className="space-y-2 rounded-xl border border-line p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{LABELS[cur.key]}</div>
                <select value={cur.font} onChange={(e) => patch(cur.key, { font: e.target.value })} className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm">
                  {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <label className="block text-xs text-ink-muted">Size {cur.size}pt
                  <input type="range" min={8} max={90} value={cur.size} onChange={(e) => patch(cur.key, { size: Number(e.target.value) })} className="mt-1 w-full accent-primary" />
                </label>
                <label className="block text-xs text-ink-muted">Width {Math.round(cur.w)}%
                  <input type="range" min={10} max={100} value={cur.w} onChange={(e) => patch(cur.key, { w: Number(e.target.value) })} className="mt-1 w-full accent-primary" />
                </label>
                <div className="flex items-center gap-2">
                  <input type="color" value={cur.color} onChange={(e) => patch(cur.key, { color: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-line" aria-label="Colour" />
                  {(["left", "center", "right"] as const).map((a) => (
                    <button key={a} type="button" onClick={() => patch(cur.key, { align: a })} className={cn("rounded-lg border px-2 py-1 text-xs capitalize", cur.align === a ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-muted")}>{a}</button>
                  ))}
                  <label className="ml-auto flex items-center gap-1 text-xs"><input type="checkbox" checked={!!cur.bold} onChange={(e) => patch(cur.key, { bold: e.target.checked })} className="accent-primary" /> Bold</label>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button className="flex-1" onClick={save} disabled={busy || !name.trim() || !image || fields.length === 0}>
          {busy ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : <><Check className="size-4" /> Save this design</>}
        </Button>
      </div>
    </div>
  );
}
