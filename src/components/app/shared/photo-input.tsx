"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, X, type LucideIcon } from "lucide-react";
import { compressImageFile } from "@/lib/image-compress";
import { Spinner } from "@/components/ui/spinner";
import { PhotoLightbox } from "@/components/ui/photo-lightbox";
import { cn } from "@/lib/utils";

/**
 * A photo field for any form: "Take photo" opens the phone camera, "Upload" picks a file. The image is shrunk in the
 * browser (1600px, 0.8) so it fits under the 1 MB server-action limit, then sent as `<name>` with `<name>Changed=1`
 * (the facility-photo pattern; see readPhoto on the server). Unchanged photos are not re-sent.
 */
export function PhotoInput({ name, initial, label = "Photo", icon: Icon = ImagePlus, wide, takeLabel = "Take photo", hint }: {
  name: string;
  initial?: string | null;
  label?: string;
  icon?: LucideIcon;
  /** A wide preview (receipts) rather than a square one (items). */
  wide?: boolean;
  takeLabel?: string;
  hint?: string;
}) {
  const [image, setImage] = useState<string | null>(initial ?? null);
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { setError("Choose a photo (JPG or PNG). PDFs can be added under Documents."); return; }
    setError("");
    setBusy(true);
    try { setImage(await compressImageFile(f, { maxDimension: 1600, quality: 0.8 })); setChanged(true); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink-muted">{label}</span>
      {changed && <input type="hidden" name={`${name}Changed`} value="1" />}
      {changed && <input type="hidden" name={name} value={image ?? ""} />}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (image ? setZoom(true) : camera.current?.click())}
          className={cn("relative shrink-0 overflow-hidden rounded-xl border border-dashed border-line bg-surface-2 text-ink-faint", wide ? "h-20 w-32" : "size-20")}
          aria-label={image ? "View the photo" : takeLabel}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center"><Icon className="size-6" /></span>
          )}
          {busy && <span className="absolute inset-0 grid place-items-center bg-surface/70 text-primary"><Spinner size="sm" /></span>}
        </button>
        <div className="flex flex-col items-start gap-1.5">
          <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="flex flex-wrap gap-1.5">
            <button type="button" disabled={busy} onClick={() => camera.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50">
              <Camera className="size-4" /> {takeLabel}
            </button>
            <button type="button" disabled={busy} onClick={() => file.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50">
              Upload
            </button>
          </div>
          {image && <button type="button" onClick={() => { setImage(null); setChanged(true); }} className="flex items-center gap-1 text-xs text-ink-faint hover:text-danger"><X className="size-3" /> Remove</button>}
          {busy && <span className="text-xs text-ink-muted">Preparing the photo…</span>}
          {hint && !busy && !image && <span className="text-[11px] text-ink-faint">{hint}</span>}
        </div>
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      {zoom && image && <PhotoLightbox src={image} alt={label} onClose={() => setZoom(false)} />}
    </div>
  );
}
