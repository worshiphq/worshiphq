"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { importCSV, type ImportResult } from "@/app/actions/import";

export function ImportModal({ onImported }: { onImported?: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setResult(null);
  }

  function close() {
    setOpen(false);
    // Delay reset so the modal animates out first
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

    startTransition(async () => {
      const res = await importCSV(fd);
      setResult(res);
      if (res.imported > 0) {
        onImported?.();
      }
    });
  }

  function downloadTemplate() {
    const headers = [
      "First Name", "Last Name", "Other Names", "Email", "Phone",
      "Gender", "Title", "Date of Birth", "Occupation", "Employer",
      "Town", "Region", "District", "Home Town", "House Address",
      "Nationality", "National ID", "Marital Status", "Department",
      "Previous Church", "Special Interest",
      "Emergency Name", "Emergency Phone", "Emergency Relation",
    ];
    const sampleRow = [
      "Kwame", "Mensah", "Kofi", "kwame@email.com", "+233240000000",
      "Male", "Mr", "1990-05-15", "Teacher", "GES",
      "Osu", "Greater Accra", "Accra Metro", "Nkawkaw", "12 Oxford St",
      "Ghanaian", "GHA-1234567890", "Married", "Choir",
      "Grace Chapel", "Music, Sound Engineering",
      "Ama Mensah", "+233200000000", "Spouse",
    ];
    const csv = [headers.join(","), sampleRow.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "worshiphq-members-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Upload /> Import CSV
      </Button>

      <Modal open={open} onClose={close} title="Import members from CSV">
        {!result ? (
          <div className="space-y-5">
            <p className="text-sm text-ink-muted">
              Upload a CSV or Excel-exported CSV file with your member list. We'll auto-match columns like
              "First Name", "Phone", "Email", "Department", "Date of Birth", etc.
            </p>

            {/* Template download */}
            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-sm font-medium text-primary-bright transition-colors hover:bg-surface-2"
            >
              <Download className="size-4" />
              Download CSV template
            </button>

            {/* File picker */}
            <div
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer rounded-2xl border-2 border-dashed border-line p-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.txt,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet className="size-10 text-primary-bright" />
                  <div className="font-medium">{file.name}</div>
                  <div className="text-xs text-ink-faint">
                    {(file.size / 1024).toFixed(1)} KB — click to change
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="size-10 text-ink-faint" />
                  <div className="font-medium">Click to select a CSV file</div>
                  <div className="text-xs text-ink-faint">
                    .csv files up to 5,000 rows
                  </div>
                </div>
              )}
            </div>

            {/* Column matching info */}
            <div className="rounded-xl border border-line bg-surface-2/40 p-4 text-xs text-ink-muted">
              <strong className="text-ink">Auto-matched columns:</strong>{" "}
              First Name, Last Name, Email, Phone, Gender, Date of Birth, Occupation,
              Town, Region, District, Nationality, National ID, Marital Status,
              Department, Emergency Contact, and more. Column names are flexible
              (e.g. "Mobile Number" maps to Phone).
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={close}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={!file || isPending}
                onClick={handleSubmit}
              >
                {isPending ? "Importing..." : `Import ${file ? file.name : ""}`}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Results */}
            <div className="flex items-start gap-4 rounded-2xl border border-line bg-surface-2/40 p-5">
              {result.imported > 0 ? (
                <CheckCircle2 className="mt-0.5 size-8 shrink-0 text-success" />
              ) : (
                <AlertCircle className="mt-0.5 size-8 shrink-0 text-danger" />
              )}
              <div>
                <h3 className="font-display text-lg font-semibold">
                  {result.imported > 0 ? "Import complete!" : "Import failed"}
                </h3>
                <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-ink-faint">Imported</div>
                    <div className="font-display text-xl font-bold text-success">{result.imported}</div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-faint">Skipped</div>
                    <div className="font-display text-xl font-bold text-warning">{result.skipped}</div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-faint">Total rows</div>
                    <div className="font-display text-xl font-bold">{result.total}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Error details */}
            {result.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-warning/30 bg-warning/5 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-warning">Issues</div>
                {result.errors.map((e, i) => (
                  <div key={i} className="text-xs text-ink-muted">{e}</div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => { reset(); }}>
                Import another
              </Button>
              <Button type="button" className="flex-1" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
