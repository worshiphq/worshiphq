"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { RotateCw, RotateCcw, ZoomIn, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const VIEW = 280; // preview square (CSS px)
const OUT = 512; // exported square (px)

/**
 * Square image cropper with pan, zoom and 90° rotate. Renders to a canvas so the
 * preview and the exported image always match. Returns a JPEG data URL.
 */
export function ImageCropper({
  src,
  onConfirm,
  onCancel,
}: {
  src: string;
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0); // degrees, 90° steps
  const offset = useRef({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  // Draw the current view onto a canvas of side `side`.
  const paint = useCallback(
    (canvas: HTMLCanvasElement, side: number) => {
      const img = imgRef.current;
      if (!img) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const k = side / VIEW; // scale factor preview → output
      ctx.clearRect(0, 0, side, side);
      ctx.save();
      ctx.translate(side / 2, side / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      // Base fit so the image covers the square at scale 1 (account for rotation).
      const rotated = rotation % 180 !== 0;
      const iw = rotated ? img.height : img.width;
      const ih = rotated ? img.width : img.height;
      const base = Math.max(VIEW / iw, VIEW / ih);
      const s = base * scale * k;
      ctx.scale(s, s);
      ctx.drawImage(img, -img.width / 2 + offset.current.x, -img.height / 2 + offset.current.y);
      ctx.restore();
    },
    [rotation, scale],
  );

  const repaint = useCallback(() => {
    if (canvasRef.current) paint(canvasRef.current, VIEW);
  }, [paint]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      offset.current = { x: 0, y: 0 };
      setReady(true);
      repaint();
    };
    img.src = src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => { if (ready) repaint(); }, [ready, scale, rotation, repaint]);

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !imgRef.current) return;
    const img = imgRef.current;
    const rotated = rotation % 180 !== 0;
    const iw = rotated ? img.height : img.width;
    const ih = rotated ? img.width : img.height;
    const base = Math.max(VIEW / iw, VIEW / ih) * scale;
    const dx = (e.clientX - drag.current.x) / base;
    const dy = (e.clientY - drag.current.y) / base;
    drag.current = { x: e.clientX, y: e.clientY };
    // Account for rotation when mapping screen drag to image space.
    const rad = (-rotation * Math.PI) / 180;
    offset.current.x += dx * Math.cos(rad) - dy * Math.sin(rad);
    offset.current.y += dx * Math.sin(rad) + dy * Math.cos(rad);
    repaint();
  }
  function onPointerUp() { drag.current = null; }

  function confirm() {
    const out = document.createElement("canvas");
    out.width = OUT; out.height = OUT;
    paint(out, OUT);
    onConfirm(out.toDataURL("image/jpeg", 0.88));
  }

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 z-[80] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold">Adjust photo</h3>
          <button onClick={onCancel} className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2"><X className="size-4" /></button>
        </div>

        <div className="mx-auto overflow-hidden rounded-full ring-2 ring-line" style={{ width: VIEW, height: VIEW }}>
          <canvas
            ref={canvasRef}
            width={VIEW}
            height={VIEW}
            className="cursor-grab touch-none active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <ZoomIn className="size-4 text-ink-faint" />
          <input
            type="range" min={1} max={4} step={0.01} value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <button type="button" onClick={() => setRotation((r) => r - 90)} className="grid size-9 place-items-center rounded-lg border border-line text-ink-muted hover:bg-surface-2"><RotateCcw className="size-4" /></button>
          <button type="button" onClick={() => setRotation((r) => r + 90)} className="grid size-9 place-items-center rounded-lg border border-line text-ink-muted hover:bg-surface-2"><RotateCw className="size-4" /></button>
        </div>
        <p className="mt-2 text-center text-xs text-ink-faint">Drag to reposition · pinch/slider to zoom · rotate</p>

        <div className="mt-4 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button type="button" className="flex-1" onClick={confirm}>Confirm</Button>
        </div>
      </div>
    </>
  );
}
