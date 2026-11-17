import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { entitlementFor, leaveBalance, yearOf } from "@/lib/payroll/leave";

export const STAFF_PAGE = 24;

const clampPage = (total: number, size: number, want: number) => {
  const last = Math.max(1, Math.ceil(total / size));
  return Math.min(Math.max(1, Math.trunc(want) || 1), last);
};

export interface StaffFilters { departmentId?: string; type?: string; status?: string }

export interface StaffRow {
  id: string; staffNo: string | null; name: string; jobTitle: string | null; department: string | null; departmentId: string | null;
  employmentType: string; status: string; startDate: string | null; photoUrl: string | null; phone: string | null; hasLogin: boolean;
}

/**
 * The staff directory. Selects StaffMember columns only and NEVER the pay profile, so salaries and ID numbers cannot
 * leak to people who only hold "Staff & leave".
 */
export async function queryStaff(churchId: string, search: string, filters: StaffFilters, pageWanted: number) {
  const words = search.trim().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 6);
  const and: Prisma.StaffMemberWhereInput[] = words.map((w) => {
    const has = { contains: w, mode: "insensitive" as const };
    return { OR: [{ firstName: has }, { lastName: has }, { otherNames: has }, { staffNo: has }, { jobTitle: has }, { phone: has }] };
  });
  const where: Prisma.StaffMemberWhereInput = {
    churchId,
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.type ? { employmentType: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : { status: { not: "left" } }),
    AND: and,
  };
  const total = await db.staffMember.count({ where });
  const page = clampPage(total, STAFF_PAGE, pageWanted);
  const rows = await db.staffMember.findMany({
    where,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
    skip: (page - 1) * STAFF_PAGE,
    take: STAFF_PAGE,
    select: {
      id: true, staffNo: true, firstName: true, lastName: true, jobTitle: true, departmentId: true, employmentType: true, status: true,
      startDate: true, phone: true, userId: true, department: { select: { name: true } }, person: { select: { photoUrl: true } },
    },
  });
  return {
    rows: rows.map((s): StaffRow => ({
      id: s.id, staffNo: s.staffNo, name: `${s.firstName} ${s.lastName}`.trim(), jobTitle: s.jobTitle, department: s.department?.name ?? null,
      departmentId: s.departmentId, employmentType: s.employmentType, status: s.status, startDate: s.startDate?.toISOString() ?? null,
      photoUrl: s.person?.photoUrl ?? null, phone: s.phone, hasLogin: !!s.userId,
    })),
    total,
    page,
  };
}

/** Counts for the Staff header (no money). */
export async function staffCounts(churchId: string) {
  const grouped = await db.staffMember.groupBy({ by: ["status"], where: { churchId }, _count: { _all: true } });
  const by = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
  return { active: by.active ?? 0, suspended: by.suspended ?? 0, left: by.left ?? 0 };
}

/** One staff member. `withPay` only for payroll holders: then the pay profile (masked), items and loans come too. */
export async function staffDetail(churchId: string, id: string, withPay: boolean) {
  const s = await db.staffMember.findFirst({
    where: { id, churchId },
    include: {
      department: { select: { id: true, name: true } },
      person: { select: { id: true, firstName: true, lastName: true, photoUrl: true, memberId: true } },
      user: { select: { id: true, name: true, staffPortalOnly: true, inviteToken: true, inviteAcceptedAt: true } },
      reportsTo: { select: { id: true, name: true } },
      documents: { orderBy: { createdAt: "desc" }, select: { id: true, kind: true, name: true, contentType: true, sizeBytes: true, payrollOnly: true, uploadedByName: true, createdAt: true } },
      ...(withPay
        ? {
            pay: {
              select: {
                basicSalary: true, currency: true, ssnitApplies: true, tier2Applies: true, payeApplies: true, isClergy: true, taxResident: true,
                ssnitNoLast4: true, tinLast4: true, ghanaCardLast4: true, payoutMethod: true, bankName: true, bankBranch: true, accountName: true,
                accountNoLast4: true, momoNetwork: true, momoNoLast4: true, updatedAt: true,
              },
            },
            payItems: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] },
            loans: { orderBy: { issuedAt: "desc" } },
          }
        : {}),
    },
  });
  return s;
}

export type StaffDetail = NonNullable<Awaited<ReturnType<typeof staffDetail>>>;

/** Leave balances per type for one person, this year. */
export async function staffLeaveBalances(churchId: string, staffId: string, year: number, startDate: Date | null) {
  const [types, adjustments, approved] = await Promise.all([
    db.leaveType.findMany({ where: { churchId, active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.leaveAdjustment.findMany({ where: { churchId, staffId, year }, select: { leaveTypeId: true, days: true } }),
    db.leaveRequest.findMany({
      where: { churchId, staffId, status: "approved", startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
      select: { leaveTypeId: true, days: true },
    }),
  ]);
  return types.map((t) => {
    const ent = entitlementFor(Number(t.daysPerYear), year, startDate && yearOf(startDate) === year ? startDate : startDate && yearOf(startDate) > year ? startDate : null);
    const adj = adjustments.filter((a) => a.leaveTypeId === t.id).map((a) => Number(a.days));
    const used = approved.filter((a) => a.leaveTypeId === t.id).map((a) => Number(a.days));
    return {
      typeId: t.id, name: t.name, color: t.color, paid: t.paid,
      entitlement: ent + adj.reduce((x, n) => x + n, 0),
      used: used.reduce((x, n) => x + n, 0),
      balance: leaveBalance(ent, adj, used),
    };
  });
}
