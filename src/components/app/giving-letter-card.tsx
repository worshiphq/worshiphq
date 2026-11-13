"use client";

import { useRef, useState } from "react";
import { FileSignature, Upload, Loader2, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";

/** Shrink a phone photo before upload (a straight-from-camera photo can be 6 MB+; the limit is 4 MB). */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
}

/**
 * The church's signed authorisation letter for online giving: print it already filled in, have two leaders sign it
 * and stamp it, then upload a photo or scan. WorshipHQ keeps it privately for Paystack if they ask.
 */
export function GivingLetterCard({ uploadedAt, canManage, onUploaded }: { uploadedAt: string | null; canManage: boolean; onUploaded: () => void }) {
  const { toast } = useFeedback();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const blob = await shrink(file);
      const fd = new FormData();
      fd.set("file", blob, blob === file ? file.name : "letter.jpg");
      const res = await fetch("/api/giving-letter", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The upload did not go through. Please try again.");
      toast("Letter uploaded. Thank you.", "success");
      onUploaded();
    } catch (e) {
      toast(e instanceof Error ? e.message : "The upload did not go through.", "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <FileSignature className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
            Authorisation letter
            {uploadedAt
              ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"><Check className="size-3" /> Uploaded {new Date(uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
              : <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">Needed</span>}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Our payment partner may ask for a letter from your church allowing us to collect gifts for you. It is already filled in with your church and account.
            Print it, have two leaders sign it, stamp it, then upload a clear photo or a scan.
          </p>
          {canManage && (
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="/giving-letter" target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-2 rounded-xl border border-line px-3.5 text-sm font-medium hover:bg-surface-2">
                <ExternalLink className="size-4" /> Open the letter to print
              </a>
              <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
              <Button size="sm" variant={uploadedAt ? "secondary" : "primary"} disabled={busy} onClick={() => input.current?.click()}>
                {busy ? <><Loader2 className="size-4 animate-spin" /> Uploading…</> : <><Upload className="size-4" /> {uploadedAt ? "Replace the signed letter" : "Upload the signed letter"}</>}
              </Button>
              {uploadedAt && <a href="/api/giving-letter" target="_blank" rel="noopener" className="inline-flex h-9 items-center px-2 text-sm text-primary hover:underline">View uploaded letter</a>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
