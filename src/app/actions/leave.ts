"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, planLockFor } from "@/lib/auth";
import { staffActor, errorResult, type ActionResult } from "@/lib/payroll/access";
import { writeEvent } from "@/lib/payroll/engine";
import { countLeaveDays, entitlementFor, leaveBalance, yearOf } from "@/lib/payroll/leave";

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const day = (v: string) => new Date(`${v}T00:00:00.000Z`);

function touch() {
  revalidatePath("/app/staff");
  revalidatePath("/app/my-pay");
}

export async function saveLeaveType(fd: FormData): Promise<ActionResult> {
  const a = await staffActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  const id = String(fd.get("id") ?? "").trim();
  const name = String(fd.get("name") ?? "").trim().slice(0, 40);
  const daysPerYear = Number(fd.get("daysPerYear") ?? 0);
  const carryOverMax = Number(fd.get("carryOverMax") ?? 0);
  if (!name) return { ok: false, error: "Name the leave type." };
  if (!(daysPerYear >= 0 && daysPerYear <= 366) || !(carryOverMax >= 0 && carryOverMax <= 366)) return { ok: false, error: "Days must be between 0 and 366." };
  const color = /^#[0-9a-fA-F]{6}$/.test(String(fd.get("color"))) ? String(fd.get("color")) : "#0d9488";
  const data = { name, daysPerYear: String(Math.round(daysPerYear * 2) / 2), carryOverMax: String(Math.round(carryOverMax * 2) / 2), paid: fd.get("paid") === "on", color };
  try {
    if (id) {
      const r = await db.leaveType.updateMany({ where: { id, churchId: s.churchId }, data });
      if (r.count !== 1) return { ok: false, error: "Leave type not found." };
    } else {
      await db.leaveType.create({ data: { ...data, churchId: s.churchId, sortOrder: 50 } });
    }
  } catch (e) {
    return errorResult(e);
  }
  touch();
  return { ok: true, message: "Leave type saved" };
}

export async function toggleLeaveType(id: string, active: boolean): Promise<ActionResult> {
  const a = await staffActor("manage");
  if (!a.ok) return a;
  await db.leaveType.updateMany({ where: { id: String(id), churchId: a.session.churchId }, data: { active: !!active } });
  touch();
  return { ok: true, message: active ? "Leave type switched on" : "Leave type switched off" };
}

async function holidaysBetween(churchId: string, from: Date, to: Date) {
  return (await db.payrollHoliday.findMany({ where: { churchId, date: { gte: from, lte: to } }, select: { date: true } })).map((h) => h.date);
}

/** Who may act on leave: staff managers for anyone; a staff member for themselves (through My pay). */
async function leaveActor(staffId: string | null) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Please sign in again." };
  if (session.isDemo) return { ok: false as const, error: "This is the read-only demo." };
  if (session.suspended && !session.impersonating) return { ok: false as const, error: "This church account is suspended." };
  if (planLockFor(session, "staff") && !session.impersonating) return { ok: false as const, error: "Staff and leave are part of the Max plan." };
  const manager = (await staffActor("manage")).ok;
  const self = !!session.staffId && (!staffId || staffId === session.staffId);
  return { ok: true as const, session, manager, self };
}

export async function requestLeave(input: { staffId?: string; leaveTypeId: string; startDate: string; endDate: string; halfDay?: boolean; reason?: string }): Promise<ActionResult> {
  const who = await leaveActor(input.staffId ?? null);
  if (!who.ok) return who;
  const s = who.session;
  const staffId = input.staffId && who.manager ? String(input.staffId) : s.staffId;
  if (!staffId || (!who.manager && staffId !== s.staffId)) return { ok: false, error: "You can only ask for your own leave." };
  try {
    const staff = await db.staffMember.findFirst({ where: { id: staffId, churchId: s.churchId }, select: { id: true, firstName: true, lastName: true, startDate: true, status: true } });
    if (!staff || staff.status === "left") return { ok: false, error: "Staff record not found." };
    const type = await db.leaveType.findFirst({ where: { id: String(input.leaveTypeId), churchId: s.churchId, active: true } });
    if (!type) return { ok: false, error: "Choose a leave type." };
    if (!isDay(input.startDate) || !isDay(input.endDate)) return { ok: false, error: "Choose the first and last day." };
    const start = day(input.startDate);
    const end = input.halfDay ? start : day(input.endDate);
    if (end < start) return { ok: false, error: "The last day is before the first day." };
    if ((end.getTime() - start.getTime()) / 86_400_000 > 200) return { ok: false, error: "That is longer than 200 days. Split it into parts." };
    if (yearOf(start) !== yearOf(end)) return { ok: false, error: "Leave cannot cross into a new year. Make two requests." };
    const days = countLeaveDays(start, end, await holidaysBetween(s.churchId, start, end), !!input.halfDay);
    if (days <= 0) return { ok: false, error: "Those dates are all weekends or holidays." };
    const overlap = await db.leaveRequest.findFirst({ where: { churchId: s.churchId, staffId, status: { in: ["pending", "approved"] }, startDate: { lte: end }, endDate: { gte: start } }, select: { id: true } });
    if (overlap) return { ok: false, error: "There is already leave on some of those days." };

    // Recorded by a manager for someone else counts as approved straight away.
    const direct = who.manager && staffId !== s.staffId;
    await db.leaveRequest.create({
      data: {
        churchId: s.churchId, staffId, leaveTypeId: type.id, startDate: start, endDate: end, days: String(days), halfDay: !!input.halfDay,
        reason: String(input.reason ?? "").slice(0, 300) || null, requestedById: s.userId, requestedByName: s.name,
        ...(direct ? { status: "approved", decidedById: s.userId, decidedByName: s.name, decidedAt: new Date() } : {}),
      },
    });
    if (!type.paid && direct) await writeEvent(db, { churchId: s.churchId, staffId, action: "leave.unpaid_approved", actorId: s.userId, actorName: s.name, detail: `Recorded ${days} unpaid leave day(s) for ${staff.firstName} ${staff.lastName}` });
    // Warn (never block) when paid leave goes below zero.
    let warning: string | undefined;
    if (type.paid && Number(type.daysPerYear) > 0) {
      const y = yearOf(start);
      const [adj, used] = await Promise.all([
        db.leaveAdjustment.findMany({ where: { churchId: s.churchId, staffId, leaveTypeId: type.id, year: y }, select: { days: true } }),
        db.leaveRequest.findMany({ where: { churchId: s.churchId, staffId, leaveTypeId: type.id, status: { in: ["approved", "pending"] }, startDate: { gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) } }, select: { days: true } }),
      ]);
      const bal = leaveBalance(entitlementFor(Number(type.daysPerYear), y, staff.startDate), adj.map((x) => Number(x.days)), used.map((x) => Number(x.days)));
      if (bal < 0) warning = `This takes ${type.name.toLowerCase()} ${Math.abs(bal)} day${Math.abs(bal) === 1 ? "" : "s"} over the allowance.`;
    }
    touch();
    return { ok: true, message: direct ? `${days} day${days === 1 ? "" : "s"} recorded` : `Asked for ${days} day${days === 1 ? "" : "s"}`, warnings: warning ? [warning] : [] };
  } catch (e) {
    return errorResult(e);
  }
}

export async function decideLeave(id: string, decision: "approved" | "declined", note?: string, notify?: boolean): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.isDemo) return { ok: false, error: "Please sign in again." };
  if (planLockFor(session, "staff") && !session.impersonating) return { ok: false, error: "Staff and leave are part of the Max plan." };
  const req = await db.leaveRequest.findFirst({
    where: { id: String(id), churchId: session.churchId },
    include: { staff: { select: { id: true, firstName: true, lastName: true, phone: true, reportsToUserId: true, userId: true } }, leaveType: { select: { name: true, paid: true } } },
  });
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "pending") return { ok: false, error: "This request was already decided." };
  const manager = (await staffActor("manage")).ok;
  const lineManager = req.staff.reportsToUserId === session.userId;
  if (!manager && !lineManager) return { ok: false, error: "Only staff managers or their line manager can decide this." };
  if (req.staff.userId === session.userId || req.staffId === session.staffId) return { ok: false, error: "You cannot decide your own leave." };
  const r = await db.leaveRequest.updateMany({
    where: { id: req.id, churchId: session.churchId, status: "pending" },
    data: { status: decision === "approved" ? "approved" : "declined", decidedById: session.userId, decidedByName: session.name, decidedAt: new Date(), decisionNote: String(note ?? "").slice(0, 300) || null },
  });
  if (r.count !== 1) return { ok: false, error: "This request was already decided." };
  if (!req.leaveType.paid && decision === "approved") {
    await writeEvent(db, { churchId: session.churchId, staffId: req.staffId, action: "leave.unpaid_approved", actorId: session.userId, actorName: session.name, detail: `Approved ${Number(req.days)} unpaid leave day(s) for ${req.staff.firstName} ${req.staff.lastName}` });
  }
  if (notify && req.staff.phone) {
    // No reason text in the SMS: SMS records are visible to some team members.
    const { sendChurchSms } = await import("@/lib/sms/credits");
    const when = req.startDate.toISOString().slice(0, 10);
    await sendChurchSms(session.churchId, req.staff.phone, `Your ${req.leaveType.name.toLowerCase()} from ${when} was ${decision === "approved" ? "approved" : "not approved"}.`, { note: "Leave decision" }).catch(() => null);
  }
  touch();
  return { ok: true, message: decision === "approved" ? "Leave approved" : "Leave declined" };
}

export async function cancelLeave(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.isDemo) return { ok: false, error: "Please sign in again." };
  const req = await db.leaveRequest.findFirst({ where: { id: String(id), churchId: session.churchId }, include: { leaveType: { select: { paid: true } } } });
  if (!req) return { ok: false, error: "Request not found." };
  const manager = (await staffActor("manage")).ok;
  const own = !!session.staffId && req.staffId === session.staffId;
  if (!manager && !(own && req.status === "pending")) return { ok: false, error: own ? "Only a request that is still waiting can be cancelled. Ask the office." : "You cannot cancel this." };
  if (req.status === "cancelled" || req.status === "declined") return { ok: false, error: "This request is not active." };
  if (req.status === "approved" && !req.leaveType.paid) {
    const months = [{ year: req.startDate.getUTCFullYear(), month: req.startDate.getUTCMonth() + 1 }, { year: req.endDate.getUTCFullYear(), month: req.endDate.getUTCMonth() + 1 }];
    const used = await db.payrollLine.findFirst({
      where: { churchId: session.churchId, staffId: req.staffId, run: { status: { in: ["review", "approved", "paid"] }, OR: months }, items: { some: { code: "unpaid_leave" } } },
      select: { id: true },
    });
    if (used) return { ok: false, error: "This unpaid leave is already in a payroll that is past draft. Adjust next month's payroll instead." };
  }
  await db.leaveRequest.update({ where: { id: req.id }, data: { status: "cancelled" } });
  touch();
  return { ok: true, message: "Leave cancelled" };
}

export async function adjustLeave(staffId: string, leaveTypeId: string, year: number, days: number, note: string): Promise<ActionResult> {
  const a = await staffActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  const d = Math.round(Number(days) * 2) / 2;
  if (!d || Math.abs(d) > 366) return { ok: false, error: "Enter the days to add (or take away, with a minus)." };
  const [staff, type] = await Promise.all([
    db.staffMember.findFirst({ where: { id: String(staffId), churchId: s.churchId }, select: { id: true } }),
    db.leaveType.findFirst({ where: { id: String(leaveTypeId), churchId: s.churchId }, select: { id: true } }),
  ]);
  if (!staff || !type) return { ok: false, error: "Not found." };
  await db.leaveAdjustment.create({ data: { churchId: s.churchId, staffId: staff.id, leaveTypeId: type.id, year: Number(year), days: String(d), note: String(note ?? "").slice(0, 200) || null, byId: s.userId, byName: s.name } });
  touch();
  return { ok: true, message: "Balance adjusted" };
}

/** Carry unused leave into the next year, up to each type's carry-over limit. Safe to run twice: it skips anyone already carried. */
export async function carryOverLeave(year: number): Promise<ActionResult> {
  const a = await staffActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  const y = Number(year);
  const types = await db.leaveType.findMany({ where: { churchId: s.churchId, active: true, paid: true, carryOverMax: { gt: 0 } } });
  if (!types.length) return { ok: false, error: "No leave type allows carry-over. Set a carry-over limit on a leave type first." };
  const staff = await db.staffMember.findMany({ where: { churchId: s.churchId, status: { not: "left" } }, select: { id: true, startDate: true } });
  const [adjs, reqs, done] = await Promise.all([
    db.leaveAdjustment.findMany({ where: { churchId: s.churchId, year: y }, select: { staffId: true, leaveTypeId: true, days: true } }),
    db.leaveRequest.findMany({ where: { churchId: s.churchId, status: "approved", startDate: { gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) } }, select: { staffId: true, leaveTypeId: true, days: true } }),
    db.leaveAdjustment.findMany({ where: { churchId: s.churchId, year: y + 1, note: { startsWith: "Carried over" } }, select: { staffId: true, leaveTypeId: true } }),
  ]);
  const doneKey = new Set(done.map((d) => `${d.staffId}:${d.leaveTypeId}`));
  const rows = [];
  for (const st of staff) for (const t of types) {
    if (doneKey.has(`${st.id}:${t.id}`)) continue;
    const bal = leaveBalance(entitlementFor(Number(t.daysPerYear), y, st.startDate), adjs.filter((x) => x.staffId === st.id && x.leaveTypeId === t.id).map((x) => Number(x.days)), reqs.filter((x) => x.staffId === st.id && x.leaveTypeId === t.id).map((x) => Number(x.days)));
    const carry = Math.min(Math.max(0, bal), Number(t.carryOverMax));
    if (carry > 0) rows.push({ churchId: s.churchId, staffId: st.id, leaveTypeId: t.id, year: y + 1, days: String(carry), note: `Carried over from ${y}`, byId: s.userId, byName: s.name });
  }
  if (rows.length) await db.leaveAdjustment.createMany({ data: rows });
  touch();
  return { ok: true, message: rows.length ? `Carried over leave for ${rows.length} balance${rows.length === 1 ? "" : "s"}` : "Nothing to carry over" };
}
