"use client";

import { useRef, useState } from "react";
import { UploadCloud, Trash2, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Label } from "@/components/ui/input";
import { updateBranding } from "@/app/actions/settings";
import { useFeedback } from "@/components/ui/feedback";
import { rgbToHex } from "@/lib/color";
import { cn } from "@/lib/utils";

const PRESETS = ["#0d7377", "#b07d20", "#15966b", "#db2777", "#2563eb", "#7c3aed", "#dc2626", "#0891b2"];
const MAX_DIM = 256; // resize logos down to keep the data URL small

export function BrandingForm({
  initialLogo,
  initialAccent,
  readOnly,
}: {
  initialLogo: string;
  initialAccent: string;
  readOnly: boolean;
}) {
  const [logo, setLogo] = useState(initialLogo);
  const [accent, setAccent] = useState(initialAccent || "#0d7377");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useFeedback();

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Please choose an image file (PNG, JPG, SVG).", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Resize to a max dimension and export as PNG data URL.
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/png");
        setLogo(dataUrl);
        const dominant = dominantColor(ctx, w, h);
        if (dominant) {
          setAccent(dominant);
          toast("Logo added — theme auto-branded from its colours.", "success");
        } else {
          toast("Logo added.", "success");
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  return (
    <Card className="p-6">
      <h3 className="font-display text-lg font-semibold">Branding</h3>
      <p className="text-sm text-ink-muted">Add your church logo and theme — it shows across your dashboard and forms.</p>

      <form action={updateBranding} className="mt-5 space-y-6">
        <input type="hidden" name="accentColor" value={accent} />
        <input type="hidden" name="logoUrl" value={logo} />

        {/* ── Logo ── */}
        <div>
          <Label>Church logo</Label>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); if (!readOnly) handleFiles(e.dataTransfer.files); }}
            onClick={() => !readOnly && fileRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition-colors",
              dragging ? "border-primary bg-primary-soft" : "border-line hover:border-primary/40 hover:bg-surface-2",
              readOnly && "pointer-events-none opacity-60",
            )}
          >
            {logo ? (
              <div className="flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="Church logo" className="size-20 rounded-xl object-cover ring-1 ring-line" />
                <div className="flex items-center gap-2">
                  <button type="button" className="text-xs font-medium text-primary-bright hover:underline" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
                    Replace
                  </button>
                  <span className="text-line">·</span>
                  <button type="button" className="flex items-center gap-1 text-xs font-medium text-danger hover:underline" onClick={(e) => { e.stopPropagation(); setLogo(""); }}>
                    <Trash2 className="size-3" /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <>
                <span className="grid size-12 place-items-center rounded-xl bg-primary-soft text-primary"><UploadCloud className="size-6" /></span>
                <div>
                  <p className="text-sm font-medium text-ink">Drag &amp; drop your logo here</p>
                  <p className="text-xs text-ink-faint">or click to browse — PNG, JPG or SVG</p>
                </div>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        </div>

        {/* ── Accent / theme ── */}
        <div>
          <Label>Dashboard theme colour</Label>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAccent(c)}
                className={cn("size-9 rounded-lg ring-2 ring-offset-2 ring-offset-surface transition", accent.toLowerCase() === c ? "ring-ink" : "ring-transparent")}
                style={{ background: c }}
                aria-label={`Accent ${c}`}
              />
            ))}
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-2">
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              Custom
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-ink-muted">
            <Wand2 className="size-3.5 text-primary-bright" />
            Uploading a logo auto-themes your dashboard from its colours — you can still pick any colour above.
          </div>
        </div>

        <SubmitButton disabled={readOnly} successMessage="Branding saved">Save branding</SubmitButton>
      </form>
    </Card>
  );
}

/** Sample the canvas and return the average colour of non-transparent, non-near-white pixels. */
function dominantColor(ctx: CanvasRenderingContext2D, w: number, h: number): string | null {
  try {
    const { data } = ctx.getImageData(0, 0, w, h);
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4 * 6) { // sample every ~6 pixels
      const alpha = data[i + 3];
      if (alpha < 128) continue;
      const pr = data[i], pg = data[i + 1], pb = data[i + 2];
      // skip near-white and near-black so logos on white bg still brand well
      const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
      if (max > 240 && min > 240) continue;
      if (max < 25) continue;
      r += pr; g += pg; b += pb; n++;
    }
    if (n === 0) return null;
    return rgbToHex(r / n, g / n, b / n);
  } catch {
    return null; // tainted canvas (e.g. SVG) — skip auto-brand
  }
}
