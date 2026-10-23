"use client";

import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download, Loader2, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { analyseImportFile, importMembersChunk, type AnalysedFile } from "@/app/actions/smart-import";
import { FIELD_OPTIONS, type FieldKey } from "@/lib/import/smart";
import { cn } from "@/lib/utils";

type Step = "pick" | "match" | "review" | "running" | "done";
type Analysis = Extract<AnalysedFile, { ok: true }>;
type Tally = { created: number; filled: number; duplicates: number; skipped: number; errors: string[] };
const EMPTY: Tally = { created: 0, filled: 0, duplicates: 0, skipped: 0, errors: [] };
const CHUNK = 250;
const GROUPS = [...new Set(FIELD_OPTIONS.map((f) => f.group))];

/**
 * Bring members in from another system. Upload any CSV or Excel file: we guess what each column is, you check it,
 * we do a practice run that shows exactly what would happen, and only then import (in slices, so a big church is fine).
 */
export function ImportModal({ onImported }: { onImported?: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<Analysis | null>(null);
  const [mapping, setMapping] = useState<FieldKey[]>([]);
  const [onDup, setOnDup] = useState<"skip" | "fill" | "add">("fill");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tally, setTally] = useState<Tally>(EMPTY);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() { setStep("pick"); setFile(null); setInfo(null); setMapping([]); setError(""); setTally(EMPTY); setProgress(0); setBusy(false); }
  function close() { setOpen(false); setTimeout(reset, 200); }

  async function choose(f: File | undefined) {
    if (!f) return;
    setFile(f); setError(""); setBusy(true);
    const fd = new FormData(); fd.set("file", f);
    try {
      const r = await analyseImportFile(fd);
      if (!r.ok) { setError(r.error); setFile(null); return; }
      setInfo(r); setMapping(r.guess); setStep("match");
    } catch (e) { setError((e as Error).message || "We could not read that file."); setFile(null); }
    finally { setBusy(false); }
  }

  const hasName = mapping.includes("firstName") || mapping.includes("fullName");

  /** Run every slice of the file, practice or for real, adding up what came back. */
  async function runAll(dryRun: boolean): Promise<Tally | null> {
    if (!file || !info) return null;
    const total: Tally = { created: 0, filled: 0, duplicates: 0, skipped: 0, errors: [] };
    for (let offset = 0; offset < info.totalRows; offset += CHUNK) {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("options", JSON.stringify({ mapping, onDuplicate: dryRun ? "skip" : onDup, dryRun, offset, limit: CHUNK }));
      const r = await importMembersChunk(fd);
      if (!r.ok) { setError(r.error); return null; }
      total.created += r.created; total.filled += r.filled; total.duplicates += r.duplicates; total.skipped += r.skipped;
      total.errors.push(...r.errors);
      setProgress(Math.min(100, Math.round(((offset + CHUNK) / info.totalRows) * 100)));
    }
    return { ...total, errors: total.errors.slice(0, 30) };
  }

  async function practice() {
    setError(""); setBusy(true); setProgress(0);
    try {
      const t = await runAll(true);
      if (t) { setTally(t); setStep("review"); }
    } catch (e) { setError((e as Error).message || "Something went wrong."); }
    finally { setBusy(false); }
  }

  async function importNow() {
    setError(""); setBusy(true); setProgress(0); setStep("running");
    try {
      const t = await runAll(false);
      if (t) { setTally(t); setStep("done"); onImported?.(); }
      else setStep("review");
    } catch (e) { setError((e as Error).message || "Something went wrong."); setStep("review"); }
    finally { setBusy(false); }
  }

  function downloadTemplate() {
    const headers = ["First Name", "Last Name", "Phone", "Email", "Gender", "Date of Birth", "Marital Status", "Department", "Group", "Date Joined", "Baptised"];
    const sample = ["Kwame", "Mensah", "0240000000", "kwame@email.com", "Male", "15/05/1990", "Married", "Choir; Ushers", "Asokwa Zone", "02/01/2015", "Yes"];
    const blob = new Blob([[headers.join(","), sample.join(",")].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "worshiphq-members-template.csv"; a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Upload /> Import members
      </Button>

      <Modal open={open} onClose={close} title="Bring in your members" wide>
        {step === "pick" && (
          <div className="space-y-5">
            <p className="text-sm text-ink-muted">
              Coming from another system, or a spreadsheet? Upload the file you exported (CSV or Excel). It does not matter how the columns are named or ordered:
              we will guess what each one is, and you check it before anything is added.
            </p>
            <div
              onClick={() => inputRef.current?.click()}
              role="button"
              aria-label="Choose a file to upload"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
              className="cursor-pointer rounded-2xl border-2 border-dashed border-line p-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <input ref={inputRef} type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv" onChange={(e) => choose(e.target.files?.[0])} className="hidden" />
              {busy ? (
                <div className="flex flex-col items-center gap-2"><Loader2 className="size-9 animate-spin text-primary" /><div className="text-sm font-medium">Reading your file…</div></div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet className="size-10 text-ink-faint" />
                  <div className="font-medium">Choose your file</div>
                  <div className="text-xs text-ink-faint">.xlsx, .csv or .txt, up to 20,000 people</div>
                </div>
              )}
            </div>
            <button type="button" onClick={downloadTemplate} className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"><Download className="size-4" /> Or download a simple template to fill in</button>
            {error && <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
          </div>
        )}

        {step === "match" && info && (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted"><b className="text-ink">{info.fileName}</b> has {info.totalRows.toLocaleString()} {info.totalRows === 1 ? "person" : "people"}. Check what each column is. Anything you do not want, choose <i>Do not import</i>.</p>
            <div className="max-h-[22rem] overflow-y-auto overscroll-contain rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-faint">
                  <tr><th className="px-3 py-2">In your file</th><th className="px-3 py-2">Examples</th><th className="px-3 py-2">It is</th></tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {info.headers.map((h, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium">{h}</td>
                      <td className="max-w-[12rem] truncate px-3 py-2 text-xs text-ink-faint">{info.samples[i].join(" · ") || "(empty)"}</td>
                      <td className="px-3 py-2">
                        <select
                          value={mapping[i]}
                          onChange={(e) => setMapping((m) => m.map((x, j) => (j === i ? (e.target.value as FieldKey) : x)))}
                          className={cn("h-9 w-full rounded-lg border bg-surface px-2 text-sm", mapping[i] === "ignore" ? "border-line text-ink-faint" : "border-primary/40")}
                        >
                          {GROUPS.map((g) => (
                            <optgroup key={g} label={g}>
                              {FIELD_OPTIONS.filter((f) => f.group === g).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!hasName && <p className="rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning">Choose which column holds the name: a full name, or a first name.</p>}
            {error && <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { reset(); }}><ArrowLeft className="size-4" /> Start again</Button>
              <Button className="flex-1" onClick={practice} disabled={!hasName || busy}>
                {busy ? <><Loader2 className="size-4 animate-spin" /> Checking {progress}%…</> : <>Check it first <ArrowRight className="size-4" /></>}
              </Button>
            </div>
          </div>
        )}

        {(step === "review" || step === "running") && info && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-success/30 bg-success/10 p-3"><div className="font-display text-2xl font-bold text-success">{tally.created.toLocaleString()}</div><div className="text-xs text-ink-muted">new people</div></div>
              <div className="rounded-xl border border-info/30 bg-info/10 p-3"><div className="font-display text-2xl font-bold text-info">{tally.duplicates.toLocaleString()}</div><div className="text-xs text-ink-muted">already in WorshipHQ</div></div>
              <div className="rounded-xl border border-line bg-surface-2 p-3"><div className="font-display text-2xl font-bold">{tally.skipped.toLocaleString()}</div><div className="text-xs text-ink-muted">rows skipped</div></div>
            </div>
            <p className="text-sm text-ink-muted">This was a practice run. Nothing has been added yet.</p>

            {tally.duplicates > 0 && (
              <div className="rounded-xl border border-line p-3">
                <div className="text-sm font-semibold">People who are already here (matched by phone, email, or name and date of birth)</div>
                <div className="mt-2 space-y-1.5 text-sm">
                  {([["fill", "Fill in what is missing", "Adds details they do not have yet. Nothing already saved is changed."], ["skip", "Leave them alone", "Skip them completely."], ["add", "Add them again anyway", "Creates a second record. Usually not what you want."]] as const).map(([k, t, d]) => (
                    <label key={k} className="flex cursor-pointer items-start gap-2">
                      <input type="radio" name="dup" checked={onDup === k} onChange={() => setOnDup(k)} className="mt-1 accent-primary" />
                      <span><span className="font-medium">{t}</span> <span className="text-xs text-ink-muted">{d}</span></span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {tally.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto overscroll-contain rounded-xl border border-warning/30 bg-warning/5 p-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-warning">Things to know</div>
                {tally.errors.map((e, i) => <div key={i} className="text-xs text-ink-muted">{e}</div>)}
              </div>
            )}
            {error && <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

            {step === "running" ? (
              <div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
                <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Adding your members… {progress}%. Please keep this window open.</p>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setStep("match")}><ArrowLeft className="size-4" /> Change the match</Button>
                <Button className="flex-1" onClick={importNow} disabled={busy || (tally.created === 0 && tally.duplicates === 0)}>
                  Add {tally.created.toLocaleString()} {tally.created === 1 ? "person" : "people"}{tally.duplicates > 0 && onDup === "fill" ? ` and fill in ${tally.duplicates.toLocaleString()}` : ""}
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="space-y-5">
            <div className="flex items-start gap-4 rounded-2xl border border-line bg-surface-2/40 p-5">
              {tally.created + tally.filled > 0 ? <CheckCircle2 className="mt-0.5 size-8 shrink-0 text-success" /> : <AlertCircle className="mt-0.5 size-8 shrink-0 text-warning" />}
              <div>
                <h3 className="font-display text-lg font-semibold">{tally.created + tally.filled > 0 ? "Your members are in" : "Nothing was added"}</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {tally.created.toLocaleString()} added{tally.filled > 0 ? `, ${tally.filled.toLocaleString()} filled in` : ""}{tally.duplicates > 0 && onDup === "skip" ? `, ${tally.duplicates.toLocaleString()} already here and left alone` : ""}, {tally.skipped.toLocaleString()} skipped.
                  Children and teens were filed under the right age group from their date of birth.
                </p>
              </div>
            </div>
            {tally.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto overscroll-contain rounded-xl border border-warning/30 bg-warning/5 p-3">
                {tally.errors.map((e, i) => <div key={i} className="text-xs text-ink-muted">{e}</div>)}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={reset}>Import another file</Button>
              <Button className="flex-1" onClick={close}>Done</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
