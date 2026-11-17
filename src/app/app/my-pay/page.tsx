import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { myPayslips, myYtd } from "@/lib/data/payroll";
import { staffLeaveBalances } from "@/lib/data/staff";
import { ensureLeaveTypes, myLeaveRequests } from "@/lib/data/leave";
import { ensureSettings } from "@/lib/payroll/engine";
import { staffDay } from "@/lib/payroll/staff-punch";
import { maskId, maskLabel } from "@/lib/payroll/mask";
import { PrivateNotice } from "@/components/app/payroll/ui";
import { MyPayClient } from "@/components/app/payroll/my-pay-client";

export const metadata = { title: "My pay" };

/** A staff member's own pay and leave. Only their own records are ever read here. */
export default async function MyPayPage() {
  const session = await requireModule("my-pay");
  if (!session.staffId) return <PrivateNotice title="Not linked yet" text="Your login is not linked to a staff record. Ask the church office." />;
  const staffId = session.staffId;
  await ensureLeaveTypes(session.churchId);
  const year = new Date().getUTCFullYear();
  const staff = await db.staffMember.findFirst({
    where: { id: staffId, churchId: session.churchId },
    select: {
      firstName: true, jobTitle: true, staffNo: true, startDate: true, department: { select: { name: true } },
      pay: { select: { ghanaCardLast4: true, payoutMethod: true, momoNetwork: true, bankName: true, momoNoLast4: true, accountNoLast4: true } },
    },
  });
  if (!staff) return <PrivateNotice title="Not linked yet" text="Your staff record could not be found. Ask the church office." />;
  const [church, settings, payslips, ytd, leave, types, requests, today] = await Promise.all([
    db.church.findUnique({ where: { id: session.churchId }, select: { name: true } }),
    ensureSettings(db, session.churchId),
    myPayslips(session.churchId, staffId, 12),
    myYtd(session.churchId, staffId, year),
    staffLeaveBalances(session.churchId, staffId, year, staff.startDate),
    db.leaveType.findMany({ where: { churchId: session.churchId, active: true }, select: { id: true, name: true, paid: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    myLeaveRequests(session.churchId, staffId),
    db.staffAttendance.findUnique({ where: { staffId_date: { staffId, date: staffDay(new Date()) } }, select: { clockIn: true, clockOut: true } }),
  ]);
  const pay = staff.pay;
  return (
    <MyPayClient
      firstName={staff.firstName}
      churchName={church?.name ?? ""}
      details={{
        jobTitle: staff.jobTitle, department: staff.department?.name ?? null, staffNo: staff.staffNo, startDate: staff.startDate?.toISOString() ?? null,
        ghanaCard: maskId("ghanaCard", pay?.ghanaCardLast4),
        payout: pay ? maskLabel(pay.payoutMethod, { network: pay.momoNetwork, bankName: pay.bankName, last4: pay.payoutMethod === "momo" ? pay.momoNoLast4 : pay.accountNoLast4 }) : "Not set",
      }}
      payslips={payslips}
      ytd={ytd}
      year={year}
      leave={leave}
      types={types}
      requests={requests}
      clock={settings.selfClockOn ? { on: true, clockIn: today?.clockIn?.toISOString() ?? null, clockOut: today?.clockOut?.toISOString() ?? null } : null}
    />
  );
}
