"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Upload, Lock, FileText, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useFeedback } from "@/components/ui/feedback";
import { deleteStaffDocument } from "@/app/actions/staff";
import { BusyButton } from "./busy-button";
import { field, fmtDay } from "./ui";

export interface DocView { id: string; kind: string; name: string; payrollOnly: boolean; sizeBytes: number; uploadedByName: string | null; createdAt: string }

/** Contracts and copies of IDs, kept privately and streamed through /api/staff-docs. */
export function DocumentsCard({ staffId, docs, canUpload, canPayrollOnly }: { staffId: string; docs: DocView[]; canUpload: boolean; canPayrollOnly: boolean }) {
  const [uploading, setUploading] = useState(false);
  const [show, setShow] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const { toast } = useFeedback();
  const router = useRouter();

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("staffId", staffId);
    setUploading(true);
    try {
      const res = await fetch("/api/staff-docs", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast(j.error ?? "Upload failed.", "error"); return; }
      toast("Document uploaded", "success");
      form.current?.reset();
      setShow(false);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Paperclip className="size-5 text-primary" /> Documents</h3>
        {canUpload && !show && <Button size="sm" variant="secondary" onClick={() => setShow(true)}><Upload className="size-4" /> Upload</Button>}
      </div>
      {show && (
        <form ref={form} onSubmit={upload} className="mb-4 space-y-3 rounded-xl border border-line p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="dc-name">Name</Label><Input id="dc-name" name="name" placeholder="e.g. Employment contract 2026" /></div>
            <div>
              <Label htmlFor="dc-kind">Kind</Label>
              <select id="dc-kind" name="kind" className={field}><option value="contract">Contract</option><option value="id">ID copy</option><option value="certificate">Certificate</option><option value="other">Other</option></select>
            </div>
          </div>
          <input type="file" name="file" accept="application/pdf,image/png,image/jpeg,image/webp" required className="block w-full text-sm" />
          {canPayrollOnly && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="payrollOnly" defaultChecked /> Only people with payroll access can open this</label>}
          <div className="flex gap-2">
            <Button type="submit" disabled={uploading}>{uploading ? <><Spinner size="sm" /> Uploading…</> : "Upload"}</Button>
            <Button type="button" variant="ghost" onClick={() => setShow(false)}>Cancel</Button>
          </div>
          <p className="text-xs text-ink-faint">PDF or photo, up to 4 MB. Kept privately, never on a public link.</p>
        </form>
      )}
      {docs.length === 0 ? <p className="text-sm text-ink-muted">No documents yet.</p> : (
        <ul className="divide-y divide-line-soft">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <FileText className="size-4 shrink-0 text-ink-faint" />
              <a href={`/api/staff-docs?id=${d.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium hover:text-primary">{d.name}</span>
                <span className="block text-xs text-ink-faint">{d.kind} · {Math.max(1, Math.round(d.sizeBytes / 1024))} KB · {fmtDay(d.createdAt)}{d.uploadedByName ? ` · ${d.uploadedByName}` : ""}</span>
              </a>
              {d.payrollOnly && <Lock className="size-3.5 text-amber-600" aria-label="Payroll only" />}
              {canUpload && (!d.payrollOnly || canPayrollOnly) && <BusyButton size="sm" variant="ghost" className="h-8 px-2" aria-label={`Remove ${d.name}`} pendingLabel="Removing…" confirm={`Remove ${d.name}? This cannot be undone.`} run={() => deleteStaffDocument(d.id)}><Trash2 className="size-4" /></BusyButton>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
