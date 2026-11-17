import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { staffDetail, staffLeaveBalances } from "@/lib/data/staff";
import { staffPayslips } from "@/lib/data/payroll";
import { ensureSettings } from "@/lib/payroll/engine";
import { PendingLink } from "@/components/ui/pending-link";
import { StaffProfileClient } from "@/components/app/payroll/staff-profile-client";
import { ChevronLeft } from "lucide-react";

export const metadata = { title: "Staff profile" };

const n = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? 0 : Number(v.toString()));

export default async function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireModule("staff");
  const { id } = await params;
  // Pay data is loaded ONLY for payroll holders: for everyone else those sections never reach the browser.
  const withPay = !!session.payroll && !session.impersonating;
  const s = await staffDetail(session.churchId, id, withPay);
  if (!s) notFound();
  const year = new Date().getUTCFullYear();
  const [leave, departments, team, settings, accounts, payslips] = await Promise.all([
    staffLeaveBalances(session.churchId, s.id, year, s.startDate),
    db.department.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { churchId: session.churchId, staffPortalOnly: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ensureSettings(db, session.churchId),
    withPay ? db.churchAccount.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    withPay ? staffPayslips(session.churchId, s.id) : Promise.resolve([]),
  ]);
  const pay = withPay && "pay" in s ? s.pay : null;
  const docs = s.documents.filter((d) => !d.payrollOnly || withPay);

  return (
    <div>
      <div className="mb-4"><PendingLink href="/app/staff" variant="ghost" size="sm" icon={<ChevronLeft className="size-4" />} pendingLabel="Opening…">All staff</PendingLink></div>
      <StaffProfileClient
        staff={{
          id: s.id, staffNo: s.staffNo, firstName: s.firstName, lastName: s.lastName, otherNames: s.otherNames, phone: s.phone, email: s.email,
          jobTitle: s.jobTitle, departmentId: s.departmentId, departmentName: s.department?.name ?? null, employmentType: s.employmentType,
          startDate: s.startDate?.toISOString() ?? null, status: s.status, endDate: s.endDate?.toISOString() ?? null, endReason: s.endReason,
          reportsToUserId: s.reportsToUserId, reportsToName: s.reportsTo?.name ?? null, emergencyName: s.emergencyName, emergencyPhone: s.emergencyPhone,
          emergencyRelation: s.emergencyRelation, notes: s.notes, personId: s.personId, photoUrl: s.person?.photoUrl ?? null,
          memberName: s.person ? `${s.person.firstName} ${s.person.lastName}` : null, createdAt: s.createdAt.toISOString(),
        }}
        // Invite tokens never leave the server: only whether one is still waiting.
        login={s.user ? { linked: true, name: s.user.name, portalOnly: s.user.staffPortalOnly, pending: !!s.user.inviteToken && !s.user.inviteAcceptedAt } : { linked: false, name: null, portalOnly: false, pending: false }}
        canEditStaff={canEdit(session, "staff")}
        payroll={withPay ? session.payroll ?? null : null}
        statutory={settings.statutoryMode !== "none"}
        pay={pay ? {
          basicSalary: n(pay.basicSalary), ssnitApplies: pay.ssnitApplies, tier2Applies: pay.tier2Applies, payeApplies: pay.payeApplies, isClergy: pay.isClergy, taxResident: pay.taxResident,
          ssnitNoLast4: pay.ssnitNoLast4, tinLast4: pay.tinLast4, ghanaCardLast4: pay.ghanaCardLast4, payoutMethod: pay.payoutMethod, bankName: pay.bankName, bankBranch: pay.bankBranch,
          accountName: pay.accountName, accountNoLast4: pay.accountNoLast4, momoNetwork: pay.momoNetwork, momoNoLast4: pay.momoNoLast4,
        } : null}
        payItems={withPay && "payItems" in s ? s.payItems.map((i) => ({ id: i.id, kind: i.kind, code: i.code, label: i.label, amount: n(i.amount), taxable: i.taxable, ssnitable: i.ssnitable, preTax: i.preTax, remitted: i.remitted, fromPeriod: i.fromPeriod, toPeriod: i.toPeriod })) : []}
        loans={withPay && "loans" in s ? s.loans.map((l) => ({ id: l.id, ref: l.ref, kind: l.kind, label: l.label, principal: n(l.principal), installment: n(l.installment), balance: n(l.balance), status: l.status, startPeriod: l.startPeriod, issuedAt: l.issuedAt.toISOString() })) : []}
        payslips={payslips}
        leave={leave}
        docs={docs.map((d) => ({ id: d.id, kind: d.kind, name: d.name, payrollOnly: d.payrollOnly, sizeBytes: d.sizeBytes, uploadedByName: d.uploadedByName, createdAt: d.createdAt.toISOString() }))}
        departments={departments}
        team={team}
        accounts={accounts}
        defaultAccountId={settings.defaultAccountId}
        portalOn={settings.portalOn}
      />
    </div>
  );
}
