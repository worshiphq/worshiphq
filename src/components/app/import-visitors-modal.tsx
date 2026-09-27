"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { importVisitorsCSV } from "@/app/actions/import-visitors";
import type { ImportResult } from "@/app/actions/import";

export function ImportVisitorsModal({ onImported }: { onImported?: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [requirePhone, setRequirePhone] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setResult(null);
  }

  function close() {
    setOpen(false);
    setTimeout(reset, 200);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
    }
  }

  function handleSubmit() {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    if (requirePhone) fd.append("requirePhone", "on");

    startTransition(async () => {
      try {
        const res = await importVisitorsCSV(fd);
        setResult(res);
        if (res.imported > 0) onImported?.();
      } catch (err) {
        setResult({
          imported: 0,
          skipped: 0,
          total: 0,
          errors: [(err as Error)?.message ?? "Something went wrong while importing. Please try again."],
        });
      }
    });
  }

  function downloadTemplate() {
    const headers = ["Name", "Phone"];
    const sampleRows = [
      ["Kwame Mensah", "+233240000000"],
      ["Ama Owusu", "+233200000000"],
    ];
    const csv = [headers.join(","), ...sampleRows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "worshiphq-visitors-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Upload className="size-4" /> Import from Excel/CSV
      </Button>

      <Modal open={open} onClose={close} title="Import visitors">
        {!result ? (
          <div className="space-y-5">
            <p className="text-sm text-ink-muted">
              For a contact list you already have elsewhere (an SMS platform, a phone export, etc.) - just
              a name and phone number is enough. No purpose, notes or photo needed; those stay blank and
              can be filled in later.
            </p>

            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-sm font-medium text-primary-bright transition-colors hover:bg-surface-2"
            >
              <Download className="size-4" />
              Download CSV template
            </button>

            <div
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer rounded-2xl border-2 border-dashed border-line p-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <input ref={inputRef} type="file" accept=".csv,.txt,text/csv" onChange={handleFileChange} className="hidden" />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet className="size-10 text-primary-bright" />
                  <div className="font-medium">{file.name}</div>
                  <div className="text-xs text-ink-faint">{(file.size / 1024).toFixed(1)} KB - click to change</div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="size-10 text-ink-faint" />
                  <div className="font-medium">Click to select a CSV file</div>
                  <div className="text-xs text-ink-faint">.csv files up to 5,000 rows</div>
                </div>
              )}
            </div>

            <label className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
              <div>
                <div className="text-sm font-medium">Require a phone number</div>
                <div className="text-xs text-ink-muted">Skip any row with no phone, since you likely want to text them.</div>
              </div>
              <input
                type="checkbox"
                checked={requirePhone}
                onChange={(e) => setRequirePhone(e.target.checked)}
                className="size-4 rounded border-line accent-primary"
              />
            </label>

            <div className="rounded-xl border border-line bg-surface-2/40 p-4 text-xs text-ink-muted">
              <strong className="text-ink">Auto-matched columns:</strong> Name (or First Name / Last Name), Phone, Email.
              Anything else in your file is ignored.
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={close}>Cancel</Button>
              <Button type="button" className="flex-1" disabled={!file || isPending} onClick={handleSubmit}>
                {isPending ? "Importing..." : `Import ${file ? file.name : ""}`}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start gap-4 rounded-2xl border border-line bg-surface-2/40 p-5">
              {result.imported > 0 ? (
                <CheckCircle2 className="mt-0.5 size-8 shrink-0 text-success" />
              ) : (
                <AlertCircle className="mt-0.5 size-8 shrink-0 text-danger" />
              )}
              <div>
                <h3 className="font-display text-lg font-semibold">{result.imported > 0 ? "Import complete!" : "Import failed"}</h3>
                <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                  <div><div className="text-xs text-ink-faint">Imported</div><div className="font-display text-xl font-bold text-success">{result.imported}</div></div>
                  <div><div className="text-xs text-ink-faint">Skipped</div><div className="font-display text-xl font-bold text-warning">{result.skipped}</div></div>
                  <div><div className="text-xs text-ink-faint">Total rows</div><div className="font-display text-xl font-bold">{result.total}</div></div>
                </div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-warning/30 bg-warning/5 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-warning">Issues</div>
                {result.errors.map((e, i) => <div key={i} className="text-xs text-ink-muted">{e}</div>)}
              </div>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={reset}>Import another</Button>
              <Button type="button" className="flex-1" onClick={close}>Done</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
