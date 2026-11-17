"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, Lock, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { field } from "./ui";
import { cn } from "@/lib/utils";

const REPORTS = [
  { key: "summary", label: "Payroll summary", text: "Everyone's gross, deductions and net for the month.", needs: "run", ids: false },
  { key: "ssnit", label: "SSNIT contribution schedule", text: "Employer number, Ghana Card or SSNIT number, basic, 5.5%, 13%, Tier 1 and Tier 2.", needs: "run", ids: true },
  { key: "paye", label: "PAYE schedule", text: "TIN or Ghana Card, position, basic, allowances, SSNIT relief, chargeable income and tax, for GRA.", needs: "run", ids: true },
  { key: "payments", label: "Bank and MoMo payment list", text: "Full account and MoMo numbers with net pay, for the bank or bulk MoMo upload.", needs: "run", ids: false, manageOnly: true },
  { key: "departments", label: "Cost by department", text: "Gross pay and employer SSNIT for each department.", needs: "run", ids: false },
  { key: "ytd", label: "Year to date per staff", text: "Totals for the year from paid payrolls.", needs: "year", ids: false },
  { key: "leave", label: "Leave taken", text: "Every approved leave request in the year.", needs: "year", ids: false },
] as const;

export function ReportsClient({ runs, initialRun, canManage }: { runs: { id: string; title: string; status: string; year: number }[]; initialRun: string | null; canManage: boolean }) {
  const [runId, setRunId] = useState(initialRun ?? runs[0]?.id ?? "");
  const years = Array.from(new Set([new Date().getUTCFullYear(), ...runs.map((r) => r.year)])).sort((a, b) => b - a);
  const [year, setYear] = useState(years[0]);
  // ID numbers are on by default only for the SSNIT and PAYE schedules (decision 6), and only for payroll managers.
  const [ids, setIds] = useState<Record<string, boolean>>({ ssnit: canManage, paye: canManage });

  const href = (key: string, format: "xlsx" | "csv", needs: string) => {
    const q = new URLSearchParams();
    if (needs === "run") q.set("run", runId); else q.set("year", String(year));
    if (format === "csv") q.set("format", "csv");
    if (ids[key]) q.set("ids", "1");
    return `/api/payroll/reports/${key}?${q}`;
  };

  return (
    <div className="space-y-5">
      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="rp-run">Payroll</Label>
          <select id="rp-run" className={field} value={runId} onChange={(e) => setRunId(e.target.value)}>
            {runs.length === 0 && <option value="">No payrolls yet</option>}
            {runs.map((r) => <option key={r.id} value={r.id}>{r.title}{r.status !== "paid" ? ` (${r.status})` : ""}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="rp-year">Year (for year reports)</Label>
          <select id="rp-year" className={field} value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y}>{y}</option>)}</select>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((r) => {
          const locked = "manageOnly" in r && r.manageOnly && !canManage;
          const disabled = locked || (r.needs === "run" && !runId);
          return (
            <Card key={r.key} className={cn("flex flex-col p-5", locked && "opacity-60")}>
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileSpreadsheet className="size-5" /></div>
                <div className="min-w-0">
                  <h3 className="font-semibold">{r.label}</h3>
                  <p className="mt-0.5 text-sm text-ink-muted">{r.text}</p>
                </div>
              </div>
              {r.ids && (
                <label className={cn("mt-3 flex items-start gap-2 text-sm", !canManage && "text-ink-faint")}>
                  <input type="checkbox" disabled={!canManage} checked={!!ids[r.key]} onChange={(e) => setIds((x) => ({ ...x, [r.key]: e.target.checked }))} className="mt-0.5" />
                  <span>Include Ghana Card, SSNIT and TIN numbers<span className="block text-xs text-ink-faint">{canManage ? "Downloads with ID numbers are recorded." : "Only payroll managers can include full numbers."}</span></span>
                </label>
              )}
              {"manageOnly" in r && r.manageOnly && <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400"><ShieldAlert className="size-3.5" />{locked ? "Only payroll managers can download this." : "Full account numbers. Downloads are recorded."}</p>}
              <div className="mt-auto flex gap-2 pt-4">
                {locked ? <span className="inline-flex items-center gap-1 text-xs text-ink-faint"><Lock className="size-3.5" /> Payroll managers only</span> : (
                  <>
                    <a aria-disabled={disabled} href={disabled ? undefined : href(r.key, "xlsx", r.needs)} className={cn("inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-b from-primary-bright to-primary px-3.5 text-sm font-semibold text-white", disabled && "pointer-events-none opacity-50")}><FileSpreadsheet className="size-4" /> Excel</a>
                    <a aria-disabled={disabled} href={disabled ? undefined : href(r.key, "csv", r.needs)} className={cn("inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3.5 text-sm font-semibold hover:bg-surface-2", disabled && "pointer-events-none opacity-50")}><FileText className="size-4" /> CSV</a>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
