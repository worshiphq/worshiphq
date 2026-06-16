"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X, Camera } from "lucide-react";

/**
 * Camera-based QR scanner. Streams the rear camera, decodes QR codes from each
 * frame with jsQR, and calls onScan(value). Debounces repeat reads so one code
 * isn't fired many times in a row.
 */
export function QrScanner({ onScan, onClose }: { onScan: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const lastRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        tick();
      } catch {
        setError("Couldn't access the camera. Check permissions and use HTTPS.");
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth, h = video.videoHeight;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            const now = Date.now();
            // Ignore the same code within 2.5s to avoid duplicate check-ins.
            if (code.data !== lastRef.current.value || now - lastRef.current.at > 2500) {
              lastRef.current = { value: code.data, at: now };
              onScan(code.data);
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onScan]);

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[70] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold"><Camera className="size-4" /> Scan member QR</h3>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2"><X className="size-5" /></button>
        </div>
        <div className="relative aspect-square bg-black">
          {error ? (
            <div className="grid h-full place-items-center p-6 text-center text-sm text-ink-faint">{error}</div>
          ) : (
            <>
              <video ref={videoRef} playsInline muted className="size-full object-cover" />
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="size-48 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <p className="p-4 text-center text-xs text-ink-faint">Point the camera at a member&rsquo;s QR code to check them in.</p>
      </div>
    </>
  );
}
