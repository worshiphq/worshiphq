"use server";

import { revalidatePath } from "next/cache";
import { requireSession, assertCanWrite, assertCanDelete, assertPlanFeature, planLockFor } from "@/lib/auth";
import { canManage, type Session } from "@/lib/permissions";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { moveToBin } from "@/lib/recycle-bin";
import { logAudit } from "@/lib/audit";
import { rateLimit, HOUR } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/integrations/email";
import { ctxFrom } from "@/lib/expenses/post";
import * as m from "@/lib/maintenance/service";
import { str, strOrNull, num, dateOf, bool, errorText } from "@/lib/form-read";
import { readPhoto } from "@/lib/uploads/photo-field";

export type ActionResult = { ok: boolean; error?: string; id?: string; posted?: "expense" | "request" | "none" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const real = (e: string | null | undefined): e is string => !!e && !e.endsWith("@invite.worshiphq.app");

/** The section that lets this person change maintenance for an item: Maintenance, or Vehicles / Assets on their own screens. */
async function writerFor(assetId?: string | null): Promise<Session> {
  const session = await requireSession();
  const allowed = (s: string) => canManage(session, s) && !planLockFor(session, s);
  if (allowed("maintenance")) { assertCanWrite(session, "maintenance"); return session; }
  if (assetId) {
    const a = await db.asset.findFirst({ where: { id: assetId, churchId: session.churchId }, select: { vehicle: { select: { id: true } } } });
    const section = a?.vehicle ? "vehicles" : "assets";
    if (a && allowed(section)) { assertCanWrite(session, section); return session; }
  }
  assertCanWrite(session, "maintenance");
  return session;
}

async function managersEmails(churchId: string) {
  const users = await db.user.findMany({ where: { churchId }, select: { email: true, role: true, customRole: { select: { manageSections: true } } } });
  return [...new Set(users.filter((u) => ["Owner", "Admin"].includes(u.role) || (u.customRole?.manageSections ?? []).includes("maintenance")).map((u) => u.email).filter(real))];
}

function mail(churchName: string, heading: string, lines: string[]) {
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/app/maintenance`;
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#1c1a16">
    <h2 style="margin:0 0 6px;color:#0d7377">${esc(heading)}</h2><p style="margin:0 0 14px;color:#6b6456">${esc(churchName)}</p>
    ${lines.map((l) => `<p style="margin:4px 0">${esc(l)}</p>`).join("")}
    <p style="margin-top:18px"><a href="${url}" style="background:#0d7377;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Open maintenance</a></p></div>`;
}

/** Anyone on the team can report a fault (rate limited, plan checked). */
export async function reportProblem(fd: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertCanWrite(session);
    assertPlanFeature(session, "maintenance");
    if (!(await rateLimit(`maint:${session.userId}`, 20, HOUR))) return { ok: false, error: "That is a lot of reports in an hour. Try again a little later." };
    const photo = await readPhoto(fd, "photo", "maintenance");
    if (!photo.ok) return photo;
    const res = await m.reportProblem(ctxFrom(session), {
      title: str(fd, "title"), description: strOrNull(fd, "description"), location: strOrNull(fd, "location"), facilityId: strOrNull(fd, "facilityId"),
      assetId: strOrNull(fd, "assetId"), priority: strOrNull(fd, "priority"), photoUrl: photo.value ?? null,
    });
    if (res.ok) {
      const to = await managersEmails(session.churchId);
      if (to.length) {
        await sendEmail({
          to, subject: `${str(fd, "priority") === "urgent" ? "Urgent: " : ""}${str(fd, "title").slice(0, 80)} - ${session.churchName}`,
          html: mail(session.churchName, "A problem was reported", [str(fd, "title"), strOrNull(fd, "location") ?? "", `Reported by ${session.name}`].filter(Boolean)),
        }).catch(() => {});
      }
    }
    return res.ok ? { ok: true, id: res.id } : res;
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function updateMaintenanceRequest(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writerFor();
    const id = str(fd, "id");
    const before = await db.maintenanceRequest.findFirst({ where: { id, churchId: session.churchId }, select: { assigneeUserId: true, title: true, location: true, priority: true } });
    if (!before) return { ok: false, error: "That request was not found." };
    const res = await m.updateRequest(ctxFrom(session), id, {
      status: fd.has("status") ? strOrNull(fd, "status") : undefined,
      priority: fd.has("priority") ? strOrNull(fd, "priority") : undefined,
      assigneeUserId: fd.has("assigneeUserId") ? strOrNull(fd, "assigneeUserId") : undefined,
      assigneeName: fd.has("assigneeName") ? strOrNull(fd, "assigneeName") : undefined,
      vendorId: fd.has("vendorId") ? strOrNull(fd, "vendorId") : undefined,
      dueDate: fd.has("dueDate") ? dateOf(fd, "dueDate") : undefined,
      estimatedCost: fd.has("estimatedCost") ? num(fd, "estimatedCost") : undefined,
    });
    if (!res.ok) return res;
    // Tell a newly assigned team member by email; text them only when "Text them" was ticked (it costs credits).
    const assignee = strOrNull(fd, "assigneeUserId");
    if (assignee && assignee !== before.assigneeUserId) {
      const u = await db.user.findFirst({ where: { id: assignee, churchId: session.churchId }, select: { email: true, phone: true, name: true } });
      if (u && real(u.email)) await sendEmail({ to: u.email, subject: `Job for you: ${before.title.slice(0, 80)} - ${session.churchName}`, html: mail(session.churchName, "A job was assigned to you", [before.title, before.location ?? "", `Assigned by ${session.name}`].filter(Boolean)) }).catch(() => {});
      if (u?.phone && bool(fd, "textThem")) {
        const { sendChurchSms } = await import("@/lib/sms/credits");
        await sendChurchSms(session.churchId, u.phone, `${session.churchName}: a repair job is assigned to you: ${before.title}${before.location ? ` (${before.location})` : ""}.`, { note: "Maintenance assignment" }).catch(() => {});
      }
    }
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function completeMaintenanceRequest(fd: FormData): Promise<ActionResult> {
  try {
    const id = str(fd, "id");
    const req = await db.maintenanceRequest.findFirst({ where: { id }, select: { assetId: true, churchId: true } });
    const session = await writerFor(req?.assetId);
    if (!req || req.churchId !== session.churchId) return { ok: false, error: "That request was not found." };
    const receipt = await readPhoto(fd, "receipt", "receipts");
    if (!receipt.ok) return receipt;
    const r = await m.completeRequest(ctxFrom(session), id, {
      actualCost: num(fd, "actualCost"), resolution: strOrNull(fd, "resolution"), record: bool(fd, "record"),
      accountId: strOrNull(fd, "accountId"), paymentMethod: strOrNull(fd, "paymentMethod"), receiptUrl: receipt.value ?? null,
    });
    return r.ok ? { ok: true, id: r.id, posted: r.posted } : r;
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function deleteMaintenanceRequest(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writerFor();
    assertCanDelete(session);
    const r = await db.maintenanceRequest.findFirst({ where: { id: str(fd, "id"), churchId: session.churchId }, select: { id: true, title: true } });
    if (!r) return { ok: false, error: "That request was not found." };
    await moveToBin(session, "maintenanceRequest", "MaintenanceRequest", r.id);
    await db.maintenanceRequest.deleteMany({ where: { id: r.id, churchId: session.churchId } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "maintenanceRequest", entityId: r.id, detail: `Deleted "${r.title}"` });
    revalidatePath("/app/maintenance");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function saveSchedule(fd: FormData): Promise<ActionResult> {
  try {
    const assetId = str(fd, "assetId");
    const session = await writerFor(assetId);
    const r = await m.saveSchedule(ctxFrom(session), {
      id: strOrNull(fd, "id"), assetId, title: str(fd, "title"), everyDays: num(fd, "everyDays") ?? ((num(fd, "everyMonths") ?? 0) * 30 || null),
      everyKm: num(fd, "everyKm"), lastDoneAt: dateOf(fd, "lastDoneAt"), lastDoneKm: num(fd, "lastDoneKm"), notes: strOrNull(fd, "notes"),
      active: fd.has("active") ? bool(fd, "active") : true,
    });
    return r.ok ? { ok: true, id: r.id } : r;
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function deleteSchedule(fd: FormData): Promise<ActionResult> {
  try {
    const s = await db.maintenanceSchedule.findFirst({ where: { id: str(fd, "id") }, select: { id: true, churchId: true, assetId: true, title: true } });
    const session = await writerFor(s?.assetId);
    assertCanDelete(session);
    if (!s || s.churchId !== session.churchId) return { ok: false, error: "That schedule was not found." };
    await moveToBin(session, "maintenanceSchedule", "MaintenanceSchedule", s.id);
    await db.maintenanceSchedule.deleteMany({ where: { id: s.id, churchId: session.churchId } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "maintenanceSchedule", entityId: s.id, detail: `Removed schedule "${s.title}"` });
    revalidatePath(`/app/assets/${s.assetId}`);
    revalidatePath("/app/vehicles", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function logMaintenance(fd: FormData): Promise<ActionResult> {
  try {
    const assetId = str(fd, "assetId");
    const session = await writerFor(assetId);
    const receipt = await readPhoto(fd, "receipt", "receipts");
    if (!receipt.ok) return receipt;
    const r = await m.logRecord(ctxFrom(session), {
      assetId, scheduleId: strOrNull(fd, "scheduleId"), kind: strOrNull(fd, "kind"), title: str(fd, "title"), date: dateOf(fd, "date"),
      odometerKm: num(fd, "odometerKm"), vendorName: strOrNull(fd, "vendorName"), vendorId: strOrNull(fd, "vendorId"), cost: num(fd, "cost"),
      notes: strOrNull(fd, "notes"), record: bool(fd, "record"), accountId: strOrNull(fd, "accountId"), paymentMethod: strOrNull(fd, "paymentMethod"),
      receiptUrl: receipt.value ?? null,
    });
    return r.ok ? { ok: true, id: r.id, posted: r.posted } : r;
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function deleteMaintenanceRecord(fd: FormData): Promise<ActionResult> {
  try {
    const rec = await db.maintenanceRecord.findFirst({ where: { id: str(fd, "id") }, select: { id: true, churchId: true, assetId: true, title: true } });
    const session = await writerFor(rec?.assetId);
    assertCanDelete(session);
    if (!rec || rec.churchId !== session.churchId) return { ok: false, error: "That record was not found." };
    // The expense it posted stays: money that was spent is removed from Expenses, by finance.
    await moveToBin(session, "maintenanceRecord", "MaintenanceRecord", rec.id);
    await db.maintenanceRecord.deleteMany({ where: { id: rec.id, churchId: session.churchId } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "maintenanceRecord", entityId: rec.id, detail: `Removed record "${rec.title}"` });
    if (rec.assetId) revalidatePath(`/app/assets/${rec.assetId}`);
    revalidatePath("/app/vehicles", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}
