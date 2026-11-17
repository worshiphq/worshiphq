"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, planLockFor } from "@/lib/auth";
import { staffActor, type ActionResult } from "@/lib/payroll/access";
import { ensureSettings } from "@/lib/payroll/engine";
import { punchStaff, staffDay } from "@/lib/payroll/staff-punch";

const STATUSES = ["present", "late", "absent", "leave", "holiday"];

/** Staff managers mark or correct a day. Times are HH:MM (Ghana time, which is UTC). */
export async function markStaffDay(staffId: string, date: string, status: string, clockIn?: string | null, clockOut?: string | null, note?: string | null): Promise<ActionResult> {
  const a = await staffActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return { ok: false, error: "Choose a date." };
  if (!STATUSES.includes(status)) return { ok: false, error: "Choose a status." };
  const staff = await db.staffMember.findFirst({ where: { id: String(staffId), churchId: s.churchId }, select: { id: true } });
  if (!staff) return { ok: false, error: "Staff record not found." };
  const at = (t?: string | null) => (t && /^\d{2}:\d{2}$/.test(t) ? new Date(`${date}T${t}:00.000Z`) : null);
  const d = new Date(`${date}T00:00:00.000Z`);
  const data = { status, clockIn: at(clockIn), clockOut: at(clockOut), note: String(note ?? "").slice(0, 200) || null, source: "manual" };
  await db.staffAttendance.upsert({ where: { staffId_date: { staffId: staff.id, date: d } }, update: data, create: { ...data, churchId: s.churchId, staffId: staff.id, date: d } });
  revalidatePath("/app/staff");
  return { ok: true, message: "Day saved" };
}

/** A staff member clocks themselves in or out from My pay, when the church allows it. */
export async function selfClock(kind: "in" | "out"): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.isDemo || session.impersonating) return { ok: false, error: "Please sign in again." };
  if (!session.staffId) return { ok: false, error: "Your login is not linked to a staff record." };
  if (planLockFor(session, "my-pay")) return { ok: false, error: "This is part of the Max plan." };
  const settings = await ensureSettings(db, session.churchId);
  if (!settings.selfClockOn) return { ok: false, error: "Clocking in from My pay is switched off." };
  const now = new Date();
  const today = await db.staffAttendance.findUnique({ where: { staffId_date: { staffId: session.staffId, date: staffDay(now) } } });
  if (kind === "in" && today?.clockIn) return { ok: false, error: "You already clocked in today." };
  if (kind === "out" && !today?.clockIn) return { ok: false, error: "Clock in first." };
  await punchStaff(session.churchId, session.staffId, now, null, "self");
  revalidatePath("/app/my-pay");
  return { ok: true, message: kind === "in" ? "Clocked in" : "Clocked out" };
}
