import "server-only";
import { db } from "@/lib/db";
import { readChurchLogo } from "@/lib/church-logo";
import { ensureSettings, ytdFor } from "@/lib/payroll/engine";
import { periodLabel } from "@/lib/payroll/calc";
import { maskId } from "@/lib/payroll/mask";
import type { PayslipData } from "@/lib/payroll/payslip-pdf";

const n = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? 0 : Number(v.toString()));
const dateText = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Accra" }).format(d);

/** Everything a payslip prints, for the lines given (all from one church). */
export async function payslipData(churchId: string, lineIds: string[]): Promise<{ lineId: string; fileName: string; data: PayslipData }[]> {
  const lines = await db.payrollLine.findMany({
    where: { churchId, id: { in: lineIds } },
    include: { items: { orderBy: { sortOrder: "asc" } }, run: true, staff: { select: { pay: { select: { ssnitNoLast4: true, ghanaCardLast4: true, tinLast4: true } } } } },
    orderBy: { staffName: "asc" },
  });
  if (!lines.length) return [];
  const [church, settings] = await Promise.all([
    db.church.findUnique({ where: { id: churchId }, select: { name: true, address: true, city: true, logoUrl: true } }),
    ensureSettings(db, churchId),
  ]);
  const logo = await readChurchLogo(church?.logoUrl);
  const out: { lineId: string; fileName: string; data: PayslipData }[] = [];
  for (const l of lines) {
    const period = periodLabel(l.run.year, l.run.month);
    const earnings = [{ label: "Basic salary", amount: n(l.basic) }, ...l.items.filter((i) => i.kind === "earning").map((i) => ({ label: i.label, amount: n(i.amount) }))].filter((e) => e.amount !== 0);
    const deductions = [
      ...(n(l.ssnitEmployee) > 0 ? [{ label: "SSNIT (employee 5.5%)".replace("5.5", String((l.run.rules as { ssnitEePct?: number })?.ssnitEePct ?? 5.5)), amount: n(l.ssnitEmployee) }] : []),
      ...(n(l.paye) > 0 ? [{ label: "PAYE income tax", amount: n(l.paye) }] : []),
      ...l.items.filter((i) => i.kind === "deduction").map((i) => ({ label: i.label, amount: n(i.amount) })),
    ];
    const totalDeductions = Math.round((n(l.ssnitEmployee) + n(l.paye) + n(l.preTaxDeductions) + n(l.otherDeductions)) * 100) / 100;
    const ytd = l.staffId && l.run.status === "paid" ? await ytdFor(db, churchId, l.staffId, l.run.year, l.run.month) : null;
    const pay = l.staff?.pay;
    out.push({
      lineId: l.id,
      fileName: `${period.replace(" ", "-")}-${(l.staffNo ?? l.staffName).replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`,
      data: {
        church: { name: church?.name ?? "Church", address: [church?.address, church?.city].filter(Boolean).join(", ") || null, logo, employerSsnitNo: settings.employerSsnitNo, employerTin: settings.employerTin },
        period, title: l.run.title, payDate: l.run.payDate ? dateText(l.run.payDate) : null,
        staff: {
          name: l.staffName, staffNo: l.staffNo, jobTitle: l.jobTitle, department: l.departmentName, payoutLabel: l.payoutLabel,
          ssnitMasked: pay?.ssnitNoLast4 ? `SSNIT ${maskId("ssnit", pay.ssnitNoLast4)}` : pay?.ghanaCardLast4 ? maskId("ghanaCard", pay.ghanaCardLast4) : null,
          tinMasked: pay?.tinLast4 ? `TIN ${maskId("tin", pay.tinLast4)}` : null,
        },
        earnings, deductions, gross: n(l.gross), totalDeductions, net: n(l.net),
        employer: n(l.ssnitEmployer) > 0 ? [{ label: "Employer SSNIT", amount: n(l.ssnitEmployer) }] : [],
        ytd: ytd ? { gross: ytd.grossP / 100, ssnit: ytd.ssnitP / 100, paye: ytd.payeP / 100, net: ytd.netP / 100 } : null,
        workingDays: l.workingDays, unpaidDays: n(l.unpaidDays),
        note: settings.payslipNote,
        reversed: l.run.status === "reversed",
      },
    });
  }
  return out;
}
