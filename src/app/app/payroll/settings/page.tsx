import { redirect } from "next/navigation";
import { requireModule, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureSettings } from "@/lib/payroll/engine";
import { recentEvents } from "@/lib/data/payroll";
import { BandsSchema } from "@/lib/payroll/rules";
import { PageHeader } from "@/components/app/page-header";
import { PayrollTabs, PrivateNotice } from "@/components/app/payroll/ui";
import { PayrollSettingsClient } from "@/components/app/payroll/settings-client";

export const metadata = { title: "Payroll settings" };

const n = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? null : Number(v.toString()));

export default async function PayrollSettingsPage() {
  const pre = await requireSession();
  if (pre.impersonating) return <PrivateNotice />;
  const session = await requireModule("payroll");
  if (session.payroll !== "manage") redirect("/app/payroll");
  const [s, accounts, sets, holidays, events] = await Promise.all([
    ensureSettings(db, session.churchId),
    db.churchAccount.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.payeBandSet.findMany({ where: { churchId: session.churchId }, orderBy: { effectiveFrom: "desc" } }),
    db.payrollHoliday.findMany({ where: { churchId: session.churchId, date: { gte: new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 1)) } }, orderBy: { date: "asc" } }),
    recentEvents(session.churchId, 40),
  ]);
  return (
    <div>
      <PageHeader title="Payroll settings" description="Rates, PAYE bands, the books, approval and payslips." />
      <PayrollTabs canManage />
      <PayrollSettingsClient
        settings={{
          statutoryMode: s.statutoryMode, ssnitEmployeePct: n(s.ssnitEmployeePct)!, ssnitEmployerPct: n(s.ssnitEmployerPct)!, tier1Pct: n(s.tier1Pct)!, tier2Pct: n(s.tier2Pct)!,
          ssnitMonthlyCap: n(s.ssnitMonthlyCap), workingDaysRule: s.workingDaysRule, fixedWorkingDays: s.fixedWorkingDays, postingMode: s.postingMode,
          salaryCategory: s.salaryCategory, ssnitCategory: s.ssnitCategory, payeCategory: s.payeCategory, deductionsCategory: s.deductionsCategory, loansCategory: s.loansCategory,
          defaultAccountId: s.defaultAccountId, employerSsnitNo: s.employerSsnitNo, employerTin: s.employerTin, makerChecker: s.makerChecker, portalOn: s.portalOn,
          smsShowAmounts: s.smsShowAmounts, payslipNote: s.payslipNote, staffNoPrefix: s.staffNoPrefix, selfClockOn: s.selfClockOn, remindersOn: s.remindersOn, budgetLinkOn: s.budgetLinkOn,
          bonusTaxMode: s.bonusTaxMode, bonusRatePct: n(s.bonusRatePct)!, bonusCapPct: n(s.bonusCapPct)!, overtimeTaxMode: s.overtimeTaxMode, overtimeLowPct: n(s.overtimeLowPct)!,
          overtimeHighPct: n(s.overtimeHighPct)!, overtimeQualifyMax: n(s.overtimeQualifyMax),
        }}
        accounts={accounts}
        bandSets={sets.map((b) => {
          const parsed = BandsSchema.safeParse(b.bands);
          return { id: b.id, name: b.name, effectiveFrom: b.effectiveFrom.toISOString(), bands: parsed.success ? parsed.data : [], note: b.note };
        })}
        holidays={holidays.map((h) => ({ id: h.id, date: h.date.toISOString(), name: h.name }))}
        events={events}
      />
    </div>
  );
}
