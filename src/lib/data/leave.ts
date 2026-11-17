import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_LEAVE_TYPES } from "@/lib/payroll/defaults";
import { entitlementFor, leaveBalance } from "@/lib/payroll/leave";

/** Seed the usual leave types the first time a church opens Leave. */
export async function ensureLeaveTypes(churchId: string) {
  const count = await db.leaveType.count({ where: { churchId } });
  if (count) return;
  await db.leaveType.createMany({
    data: DEFAULT_LEAVE_TYPES.map((t, i) => ({ churchId, name: t.name, daysPerYear: String(t.daysPerYear), paid: t.paid, carryOverMax: String(t.carryOverMax), color: t.color, sortOrder: i })),
    skipDuplicates: true,
  });
}

const yearRange = (y: number) => ({ gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) });

/** Everything the Leave tab shows: waiting requests, a month of approved leave, balances and types. Names only, no pay. */
export async function leaveOverview(churchId: string, year: number, month: number) {
  await ensureLeaveTypes(churchId);
  const ms = new Date(Date.UTC(year, month - 1, 1));
  const me = new Date(Date.UTC(year, month, 0));
  const [types, pending, monthReqs, staff, adjs, approvedYear, holidays] = await Promise.all([
    db.leaveType.findMany({ where: { churchId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.leaveRequest.findMany({ where: { churchId, status: "pending" }, orderBy: { startDate: "asc" }, include: { staff: { select: { id: true, firstName: true, lastName: true, reportsToUserId: true, userId: true } }, leaveType: { select: { name: true, color: true, paid: true } } } }),
    db.leaveRequest.findMany({ where: { churchId, status: "approved", startDate: { lte: me }, endDate: { gte: ms } }, include: { staff: { select: { firstName: true, lastName: true } }, leaveType: { select: { name: true, color: true } } } }),
    db.staffMember.findMany({ where: { churchId, status: { not: "left" } }, select: { id: true, firstName: true, lastName: true, startDate: true }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }] }),
    db.leaveAdjustment.findMany({ where: { churchId, year }, select: { staffId: true, leaveTypeId: true, days: true } }),
    db.leaveRequest.findMany({ where: { churchId, status: "approved", startDate: yearRange(year) }, select: { staffId: true, leaveTypeId: true, days: true } }),
    db.payrollHoliday.findMany({ where: { churchId, date: { gte: ms, lte: me } }, select: { date: true, name: true } }),
  ]);
  const active = types.filter((t) => t.active);
  return {
    types: types.map((t) => ({ id: t.id, name: t.name, daysPerYear: Number(t.daysPerYear), paid: t.paid, carryOverMax: Number(t.carryOverMax), color: t.color, active: t.active })),
    pending: pending.map((r) => ({
      id: r.id, staffId: r.staffId, name: `${r.staff.firstName} ${r.staff.lastName}`, type: r.leaveType.name, color: r.leaveType.color, paid: r.leaveType.paid,
      startDate: r.startDate.toISOString(), endDate: r.endDate.toISOString(), days: Number(r.days), halfDay: r.halfDay, reason: r.reason, requestedByName: r.requestedByName,
      reportsToUserId: r.staff.reportsToUserId, staffUserId: r.staff.userId,
    })),
    month: monthReqs.map((r) => ({ id: r.id, name: `${r.staff.firstName} ${r.staff.lastName}`, type: r.leaveType.name, color: r.leaveType.color, startDate: r.startDate.toISOString(), endDate: r.endDate.toISOString(), halfDay: r.halfDay })),
    holidays: holidays.map((h) => ({ date: h.date.toISOString(), name: h.name })),
    staff: staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` })),
    balances: staff.map((s) => ({
      staffId: s.id,
      name: `${s.firstName} ${s.lastName}`,
      byType: Object.fromEntries(active.map((t) => [t.id, leaveBalance(
        entitlementFor(Number(t.daysPerYear), year, s.startDate),
        adjs.filter((a) => a.staffId === s.id && a.leaveTypeId === t.id).map((a) => Number(a.days)),
        approvedYear.filter((a) => a.staffId === s.id && a.leaveTypeId === t.id).map((a) => Number(a.days)),
      )])),
    })),
  };
}

export type LeaveOverview = Awaited<ReturnType<typeof leaveOverview>>;

/** A staff member's own requests (My pay). */
export async function myLeaveRequests(churchId: string, staffId: string) {
  const rows = await db.leaveRequest.findMany({ where: { churchId, staffId }, orderBy: { startDate: "desc" }, take: 30, include: { leaveType: { select: { name: true, color: true } } } });
  return rows.map((r) => ({ id: r.id, type: r.leaveType.name, color: r.leaveType.color, startDate: r.startDate.toISOString(), endDate: r.endDate.toISOString(), days: Number(r.days), status: r.status, decisionNote: r.decisionNote }));
}

/** Staff attendance for one week (Monday to Sunday), names and times only. */
export async function attendanceWeek(churchId: string, monday: Date) {
  const end = new Date(monday.getTime() + 6 * 86_400_000);
  const [staff, rows] = await Promise.all([
    db.staffMember.findMany({ where: { churchId, status: "active" }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }] }),
    db.staffAttendance.findMany({ where: { churchId, date: { gte: monday, lte: end } } }),
  ]);
  return {
    staff: staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` })),
    rows: rows.map((r) => ({ staffId: r.staffId, date: r.date.toISOString().slice(0, 10), status: r.status, clockIn: r.clockIn?.toISOString() ?? null, clockOut: r.clockOut?.toISOString() ?? null, source: r.source, note: r.note })),
  };
}
