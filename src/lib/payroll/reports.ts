import "server-only";
import { db } from "@/lib/db";
import { periodLabel } from "@/lib/payroll/calc";
import { revealId } from "@/lib/payroll/secrets";
import { maskId } from "@/lib/payroll/mask";
import { ensureSettings } from "@/lib/payroll/engine";

/**
 * Payroll reports, each { title, subtitle, headers, rows } for buildWorkbook or CSV. Only the API route calls these,
 * after checking payroll access. Payroll is never part of the "Download data" bundle.
 */
export interface Report { name: string; title: string; subtitle: string; headers: string[]; rows: unknown[][] }

export const REPORTS = {
  summary: { label: "Payroll summary", needs: "run", ids: false },
  ssnit: { label: "SSNIT contribution schedule", needs: "run", ids: true },
  paye: { label: "PAYE schedule", needs: "run", ids: true },
  payments: { label: "Bank and MoMo payment list", needs: "run", ids: false, manageOnly: true },
  ytd: { label: "Year to date per staff", needs: "year", ids: false },
  departments: { label: "Cost by department", needs: "run", ids: false },
  leave: { label: "Leave taken", needs: "year", ids: false },
} as const;
export type ReportKey = keyof typeof REPORTS;

const n = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? 0 : Number(v.toString()));
const r2 = (x: number) => Math.round(x * 100) / 100;

async function runFor(churchId: string, runId: string) {
  const run = await db.payrollRun.findFirst({
    where: { id: runId, churchId },
    include: {
      lines: {
        where: { excluded: false },
        orderBy: { staffName: "asc" },
        include: { items: true, staff: { select: { pay: { select: { ssnitNoSealed: true, ssnitNoLast4: true, ghanaCardSealed: true, ghanaCardLast4: true, tinSealed: true, tinLast4: true } } } } },
      },
    },
  });
  if (!run) throw new Error("Payroll not found.");
  return run;
}

type IdPay = { ssnitNoSealed: string | null; ssnitNoLast4: string | null; ghanaCardSealed: string | null; ghanaCardLast4: string | null; tinSealed: string | null; tinLast4: string | null } | null | undefined;
function idOf(pay: IdPay, which: "ssnit" | "tin", full: boolean): string {
  if (!pay) return "";
  if (which === "ssnit") {
    if (pay.ghanaCardLast4) return full ? revealId(pay.ghanaCardSealed) ?? "Enter again" : maskId("ghanaCard", pay.ghanaCardLast4);
    if (pay.ssnitNoLast4) return full ? revealId(pay.ssnitNoSealed) ?? "Enter again" : maskId("ssnit", pay.ssnitNoLast4);
    return "";
  }
  if (pay.tinLast4) return full ? revealId(pay.tinSealed) ?? "Enter again" : maskId("tin", pay.tinLast4);
  if (pay.ghanaCardLast4) return full ? revealId(pay.ghanaCardSealed) ?? "Enter again" : maskId("ghanaCard", pay.ghanaCardLast4);
  return "";
}

const allowances = (items: { kind: string; code: string; amount: { toString(): string } }[]) =>
  r2(items.filter((i) => i.kind === "earning" && i.code !== "unpaid_leave").reduce((t, i) => t + n(i.amount), 0));
const unpaid = (items: { kind: string; code: string; amount: { toString(): string } }[]) =>
  r2(items.filter((i) => i.code === "unpaid_leave").reduce((t, i) => t + n(i.amount), 0));

function totalsRow(label: string, rows: unknown[][], from: number, labelCol = 1): unknown[] {
  const width = rows[0]?.length ?? 0;
  const out: unknown[] = Array.from({ length: width }, () => "");
  out[labelCol] = label;
  for (let c = from; c < width; c++) out[c] = r2(rows.reduce((t, r) => t + (typeof r[c] === "number" ? (r[c] as number) : 0), 0));
  return out;
}

export async function buildReport(churchId: string, key: ReportKey, opts: { runId?: string; year?: number; withIds?: boolean }): Promise<Report> {
  const def = REPORTS[key];
  const settings = await ensureSettings(db, churchId);
  if (def.needs === "run") {
    if (!opts.runId) throw new Error("Choose a payroll.");
    const run = await runFor(churchId, opts.runId);
    const period = periodLabel(run.year, run.month);
    const sub = `${period} (${run.title}), ${run.lines.length} staff, status ${run.status}`;
    if (key === "summary") {
      const rows = run.lines.map((l) => [l.staffNo ?? "", l.staffName, l.departmentName ?? "", n(l.basic), unpaid(l.items), allowances(l.items), n(l.gross), n(l.ssnitEmployee), n(l.paye), r2(n(l.preTaxDeductions) + n(l.otherDeductions)), n(l.net), n(l.ssnitEmployer), n(l.employerCost)]);
      return { name: "Payroll summary", title: `Payroll summary: ${period}`, subtitle: sub, headers: ["Staff no", "Name", "Department", "Basic", "Unpaid leave", "Allowances and extras", "Gross", "SSNIT (employee)", "PAYE", "Other deductions", "Net pay", "SSNIT (employer)", "Employer cost"], rows: rows.length ? [...rows, [], totalsRow("Total", rows, 3)] : rows };
    }
    if (key === "ssnit") {
      const rows = run.lines.filter((l) => n(l.ssnitEmployee) + n(l.ssnitEmployer) > 0).map((l) => [idOf(l.staff?.pay, "ssnit", !!opts.withIds), l.staffName, n(l.ssnitBase), n(l.ssnitEmployee), n(l.ssnitEmployer), r2(n(l.ssnitEmployee) + n(l.ssnitEmployer)), n(l.tier1), n(l.tier2)]);
      return { name: "SSNIT", title: `SSNIT contribution schedule: ${period}`, subtitle: `Employer SSNIT number ${settings.employerSsnitNo ?? "(add it in Payroll settings)"}. ${sub}`, headers: ["Ghana Card or SSNIT number", "Name", "Basic (contribution base)", "Employee", "Employer", "Total", "Tier 1 (SSNIT)", "Tier 2 (trustee)"], rows: rows.length ? [...rows, [], totalsRow("Total", rows, 2)] : rows };
    }
    if (key === "paye") {
      const rows = run.lines.filter((l) => l.payeApplies).map((l) => [idOf(l.staff?.pay, "tin", !!opts.withIds), l.staffName, l.jobTitle ?? "", r2(n(l.basic) + unpaid(l.items)), allowances(l.items), n(l.gross), n(l.ssnitEmployee), n(l.taxableIncome), n(l.paye)]);
      return { name: "PAYE", title: `PAYE schedule: ${period}`, subtitle: `Employer TIN ${settings.employerTin ?? "(add it in Payroll settings)"}. ${sub}`, headers: ["TIN or Ghana Card", "Name", "Position", "Basic", "Allowances", "Gross", "SSNIT relief", "Chargeable income", "Tax"], rows: rows.length ? [...rows, [], totalsRow("Total", rows, 3)] : rows };
    }
    if (key === "payments") {
      const staffIds = run.lines.map((l) => l.staffId).filter((x): x is string => !!x);
      const pays = await db.staffPayProfile.findMany({ where: { churchId, staffId: { in: staffIds } } });
      const by = new Map(pays.map((p) => [p.staffId, p]));
      const rows = run.lines.map((l) => {
        const p = l.staffId ? by.get(l.staffId) : undefined;
        const method = p?.payoutMethod ?? "";
        return [l.staffName, method === "momo" ? "Mobile Money" : method === "bank" ? "Bank" : method ? method[0].toUpperCase() + method.slice(1) : "",
          method === "momo" ? p?.momoNetwork ?? "" : p?.bankName ?? "", method === "bank" ? p?.bankBranch ?? "" : "", p?.accountName ?? l.staffName,
          method === "momo" ? revealId(p?.momoNoSealed) ?? "" : method === "bank" ? revealId(p?.accountNoSealed) ?? "" : "", n(l.net)];
      });
      return { name: "Payments", title: `Payment list: ${period}`, subtitle: `${sub}. Private: full account numbers.`, headers: ["Name", "Method", "Bank or network", "Branch", "Account name", "Account or MoMo number", "Net pay"], rows: rows.length ? [...rows, [], totalsRow("Total", rows, 6, 0)] : rows };
    }
    // departments
    const by = new Map<string, { gross: number; er: number; cost: number; count: number }>();
    for (const l of run.lines) {
      const k = l.departmentName ?? "No department";
      const cur = by.get(k) ?? { gross: 0, er: 0, cost: 0, count: 0 };
      cur.gross += n(l.gross); cur.er += n(l.ssnitEmployer); cur.cost += n(l.employerCost); cur.count++;
      by.set(k, cur);
    }
    const rows = [...by.entries()].sort((a, b) => b[1].cost - a[1].cost).map(([k, v]) => [k, v.count, r2(v.gross), r2(v.er), r2(v.cost)]);
    return { name: "Departments", title: `Cost by department: ${period}`, subtitle: sub, headers: ["Department", "Staff", "Gross pay", "Employer SSNIT", "Total cost"], rows: rows.length ? [...rows, [], totalsRow("Total", rows, 1, 0)] : rows };
  }

  const year = opts.year && opts.year > 2000 && opts.year < 2100 ? opts.year : new Date().getUTCFullYear();
  if (key === "ytd") {
    const lines = await db.payrollLine.findMany({ where: { churchId, excluded: false, run: { status: "paid", year } }, select: { staffId: true, staffNo: true, staffName: true, gross: true, ssnitEmployee: true, ssnitEmployer: true, paye: true, net: true, employerCost: true } });
    const by = new Map<string, { no: string; name: string; months: number; gross: number; ee: number; er: number; paye: number; net: number; cost: number }>();
    for (const l of lines) {
      const k = l.staffId ?? l.staffName;
      const cur = by.get(k) ?? { no: l.staffNo ?? "", name: l.staffName, months: 0, gross: 0, ee: 0, er: 0, paye: 0, net: 0, cost: 0 };
      cur.months++; cur.gross += n(l.gross); cur.ee += n(l.ssnitEmployee); cur.er += n(l.ssnitEmployer); cur.paye += n(l.paye); cur.net += n(l.net); cur.cost += n(l.employerCost);
      by.set(k, cur);
    }
    const rows = [...by.values()].sort((a, b) => a.name.localeCompare(b.name)).map((v) => [v.no, v.name, v.months, r2(v.gross), r2(v.ee), r2(v.paye), r2(v.net), r2(v.er), r2(v.cost)]);
    return { name: `YTD ${year}`, title: `Year to date ${year}`, subtitle: "Paid payrolls only (reversed ones are left out)", headers: ["Staff no", "Name", "Pay slips", "Gross", "SSNIT (employee)", "PAYE", "Net pay", "SSNIT (employer)", "Employer cost"], rows: rows.length ? [...rows, [], totalsRow("Total", rows, 3)] : rows };
  }
  // leave
  const reqs = await db.leaveRequest.findMany({
    where: { churchId, status: "approved", startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    include: { staff: { select: { staffNo: true, firstName: true, lastName: true } }, leaveType: { select: { name: true, paid: true } } },
    orderBy: { startDate: "asc" },
  });
  const rows = reqs.map((r) => [r.staff.staffNo ?? "", `${r.staff.firstName} ${r.staff.lastName}`, r.leaveType.name, r.leaveType.paid ? "Paid" : "Unpaid", r.startDate.toISOString().slice(0, 10), r.endDate.toISOString().slice(0, 10), n(r.days), r.decidedByName ?? ""]);
  return { name: `Leave ${year}`, title: `Leave taken ${year}`, subtitle: `${rows.length} approved requests`, headers: ["Staff no", "Name", "Type", "Paid", "From", "To", "Days", "Approved by"], rows };
}
