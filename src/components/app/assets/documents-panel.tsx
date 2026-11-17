"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImageIcon, Trash2, Upload } from "lucide-react";
import { deleteAssetDocument } from "@/app/actions/assets";
import { deleteVehicleDocument } from "@/app/actions/vehicles";
import { compressImageFile } from "@/lib/image-compress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { Spinner } from "@/components/ui/spinner";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";
import { Sheet, BusyButton, FormError, F, Select, Dot, fmtDate } from "@/components/app/shared/kit";
import { DOCUMENT_KINDS } from "@/lib/assets/categories";
import { expiryState } from "@/lib/fleet/due";

export type Doc = { id: string; kind: string; name: string; url: string; contentType: string | null; expiresAt: string | null; createdAt: string };

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** Upload a PDF or photo for an item. Photos are shrunk first; everything goes through /api/uploads/asset-document. */
export function UploadDocSheet({ assetId, defaultKind = "other", vehicle, onClose }: { assetId: string; defaultKind?: string; vehicle?: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState(defaultKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const kinds = vehicle ? DOCUMENT_KINDS.filter((k) => ["insurance", "roadworthy", "registration", "receipt", "photo", "other"].includes(k.key)) : DOCUMENT_KINDS;
  const dated = ["insurance", "roadworthy", "registration", "warranty"].includes(kind);

  const submit = async (fd: FormData) => {
    setError("");
    if (!file) { setError("Choose a file."); return; }
    setBusy(true);
    try {
      let body: Blob = file;
      let type = file.type;
      if (file.type.startsWith("image/")) {
        body = await dataUrlToBlob(await compressImageFile(file, { maxDimension: 1600, quality: 0.8 }));
        type = body.type || "image/jpeg";
      }
      const out = new FormData();
      out.set("assetId", assetId);
      out.set("kind", kind);
      out.set("name", String(fd.get("name") ?? "") || file.name);
      out.set("expiresAt", String(fd.get("expiresAt") ?? ""));
      out.set("file", new File([body], file.name, { type }));
      const res = await fetch("/api/uploads/asset-document", { method: "POST", body: out });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) { setError(json.error ?? "The upload did not finish. Try again."); return; }
      toast("Document added", "success");
      router.refresh();
      onClose();
    } catch {
      setError("The upload did not finish. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} busy={busy} title="Add a document" description="A PDF or a clear photo, up to 4 MB.">
      <form action={submit} className="space-y-4">
        <input ref={input} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" onClick={() => input.current?.click()} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line bg-surface-2/50 p-4 text-left hover:border-primary/50">
          <Upload className="size-5 text-primary" />
          <span className="min-w-0 text-sm">{file ? <span className="font-medium">{file.name}</span> : <span className="text-ink-muted">Choose a PDF or photo</span>}</span>
        </button>
        <F label="What is it" htmlFor="ud-k"><Select id="ud-k" value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k.key, label: k.label }))} /></F>
        <F label="Name (optional)" htmlFor="ud-n"><Input id="ud-n" name="name" placeholder="e.g. 2026 insurance certificate" /></F>
        {dated && <F label="Runs out on" htmlFor="ud-e" hint={vehicle && kind !== "warranty" ? "This also updates the date on the vehicle." : undefined}><Input id="ud-e" name="expiresAt" type="date" /></F>}
        <FormError error={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
          <BusyButton busy={busy} busyLabel="Uploading…" className="flex-1">Upload</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}

export function DocumentList({ docs, canWrite, canDelete, vehicle }: { docs: Doc[]; canWrite: boolean; canDelete: boolean; vehicle?: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();
  if (!docs.length) return <p className="py-6 text-center text-sm text-ink-faint">No documents yet.</p>;
  const remove = (id: string) => {
    if (!confirmBinDelete("Remove this document?")) return;
    const fd = new FormData();
    fd.set("id", id);
    setPendingId(id);
    start(async () => {
      const r = vehicle ? await deleteVehicleDocument(fd) : await deleteAssetDocument(fd);
      setPendingId(null);
      if (r.ok) { binDeleted(); router.refresh(); } else toast(r.error ?? "Could not remove it.", "error");
    });
  };
  return (
    <ul className="divide-y divide-line-soft">
      {docs.map((d) => {
        const exp = d.expiresAt ? expiryState(d.expiresAt) : null;
        const isPdf = d.contentType === "application/pdf";
        return (
          <li key={d.id} className="flex items-center gap-3 py-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-muted">{isPdf ? <FileText className="size-4" /> : <ImageIcon className="size-4" />}</span>
            <a href={d.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium hover:text-primary">{d.name}</span>
              <span className="block text-xs text-ink-muted">{DOCUMENT_KINDS.find((k) => k.key === d.kind)?.label ?? "Other"} · added {fmtDate(d.createdAt)}</span>
            </a>
            {exp && <Dot tone={exp.state === "overdue" ? "danger" : exp.state === "soon" ? "warning" : "success"}>{exp.state === "overdue" ? "Expired" : `Until ${fmtDate(d.expiresAt)}`}</Dot>}
            {canWrite && canDelete && (
              <button onClick={() => remove(d.id)} disabled={pendingId === d.id} className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger" aria-label={`Remove ${d.name}`}>
                {pendingId === d.id ? <Spinner size="sm" /> : <Trash2 className="size-4" />}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
