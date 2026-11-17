"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { staffActor, payrollActor, errorResult, type ActionResult } from "@/lib/payroll/access";
import { writeEvent, ensureSettings } from "@/lib/payroll/engine";
import { queryStaff, type StaffFilters } from "@/lib/data/staff";
import { normalisePhone } from "@/lib/phone";

const str = (fd: FormData, k: string, max = 120) => String(fd.get(k) ?? "").trim().slice(0, max);
const opt = (fd: FormData, k: string, max = 120) => str(fd, k, max) || null;
const dateOrNull = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null);
const TYPES = ["full_time", "part_time", "contract", "stipend"];

/** Server-side search for the staff list (no pay data). */
export async function searchStaff(search: string, filters: StaffFilters, page: number) {
  const a = await staffActor("view");
  if (!a.ok) return { rows: [], total: 0, page: 1 };
  return queryStaff(a.session.churchId, String(search ?? ""), {
    departmentId: typeof filters?.departmentId === "string" ? filters.departmentId : undefined,
    type: typeof filters?.type === "string" && TYPES.includes(filters.type) ? filters.type : undefined,
    status: typeof filters?.status === "string" && ["active", "suspended", "left"].includes(filters.status) ? filters.status : undefined,
  }, Number(page) || 1);
}

/** Add or update a staff record (no pay: that is savePayProfile, payroll only). */
export async function saveStaff(fd: FormData): Promise<ActionResult & { id?: string }> {
  const a = await staffActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  try {
    const id = str(fd, "id", 40) || null;
    let personId = str(fd, "personId", 40) || null;
    let firstName = str(fd, "firstName", 60);
    let lastName = str(fd, "lastName", 60);
    let phone = opt(fd, "phone", 30);
    let email = opt(fd, "email", 120);
    let emergencyName = opt(fd, "emergencyName", 80);
    let emergencyPhone = opt(fd, "emergencyPhone", 30);
    const emergencyRelation = opt(fd, "emergencyRelation", 40);

    if (personId) {
      const person = await db.person.findFirst({
        where: { id: personId, churchId: s.churchId },
        select: { id: true, firstName: true, lastName: true, phone: true, email: true, emergencyName: true, emergencyPhone: true },
      }).catch(() => null) as { id: string; firstName: string; lastName: string; phone: string | null; email: string | null; emergencyName?: string | null; emergencyPhone?: string | null } | null;
      if (!person) return { ok: false, error: "That member was not found." };
      const taken = await db.staffMember.findFirst({ where: { personId, churchId: s.churchId, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
      if (taken) return { ok: false, error: "That person already has a staff record." };
      firstName ||= person.firstName;
      lastName ||= person.lastName;
      phone ||= person.phone;
      email ||= person.email;
      emergencyName ||= person.emergencyName ?? null;
      emergencyPhone ||= person.emergencyPhone ?? null;
    } else personId = null;
    if (!firstName || !lastName) return { ok: false, error: "Add their first and last name." };
    if (phone) phone = normalisePhone(phone) || phone;

    const departmentIdRaw = str(fd, "departmentId", 40);
    const departmentId = departmentIdRaw ? (await db.department.findFirst({ where: { id: departmentIdRaw, churchId: s.churchId }, select: { id: true } }))?.id ?? null : null;
    if (departmentIdRaw && !departmentId) return { ok: false, error: "That department was not found." };
    const reportsRaw = str(fd, "reportsToUserId", 40);
    const reportsToUserId = reportsRaw ? (await db.user.findFirst({ where: { id: reportsRaw, churchId: s.churchId, staffPortalOnly: false }, select: { id: true } }))?.id ?? null : null;
    const employmentType = TYPES.includes(str(fd, "employmentType")) ? str(fd, "employmentType") : "full_time";

    const data = {
      personId, firstName, lastName, otherNames: opt(fd, "otherNames", 60), phone, email,
      jobTitle: opt(fd, "jobTitle", 80), departmentId, employmentType, startDate: dateOrNull(str(fd, "startDate")),
      reportsToUserId, emergencyName, emergencyPhone, emergencyRelation, notes: opt(fd, "notes", 1000),
    };

    let staffId: string;
    if (id) {
      const existing = await db.staffMember.findFirst({ where: { id, churchId: s.churchId }, select: { id: true } });
      if (!existing) return { ok: false, error: "Staff record not found." };
      await db.staffMember.update({ where: { id }, data });
      staffId = id;
      await audit(s, "update", "staff", `Updated staff record for ${firstName} ${lastName}`, id);
    } else {
      staffId = await db.$transaction(async (tx) => {
        await ensureSettings(tx, s.churchId);
        const bumped = await tx.payrollSettings.update({ where: { churchId: s.churchId }, data: { staffSeq: { increment: 1 } }, select: { staffSeq: true, staffNoPrefix: true } });
        const staffNo = `${bumped.staffNoPrefix}-${String(bumped.staffSeq).padStart(3, "0")}`;
        const row = await tx.staffMember.create({ data: { churchId: s.churchId, staffNo, ...data } });
        await writeEvent(tx, { churchId: s.churchId, staffId: row.id, action: "staff.created", actorId: s.userId, actorName: s.name, detail: `Added ${firstName} ${lastName} (${staffNo})` });
        return row.id;
      });
      await audit(s, "create", "staff", `Added ${firstName} ${lastName} to staff`, staffId);
    }
    revalidatePath("/app/staff");
    return { ok: true, id: staffId, message: id ? "Staff record saved" : `${firstName} added to staff` };
  } catch (e) {
    return errorResult(e);
  }
}

export async function setStaffStatus(id: string, status: string, endDate: string | null, reason: string | null): Promise<ActionResult> {
  const a = await staffActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  if (!["active", "suspended", "left"].includes(status)) return { ok: false, error: "Choose a status." };
  const row = await db.staffMember.findFirst({ where: { id: String(id), churchId: s.churchId }, select: { id: true, firstName: true, lastName: true, userId: true } });
  if (!row) return { ok: false, error: "Staff record not found." };
  await db.staffMember.update({
    where: { id: row.id },
    data: { status, endDate: status === "left" ? dateOrNull(String(endDate ?? "")) ?? new Date() : null, endReason: status === "left" ? (reason ?? "").slice(0, 200) || null : null },
  });
  // Someone who has left loses their portal login straight away.
  if (status === "left" && row.userId) {
    const u = await db.user.findFirst({ where: { id: row.userId, churchId: s.churchId }, select: { staffPortalOnly: true } });
    if (u?.staffPortalOnly) await db.user.updateMany({ where: { id: row.userId, churchId: s.churchId }, data: { sessionVersion: { increment: 1 }, inviteToken: null, passwordHash: null } });
  }
  await writeEvent(db, { churchId: s.churchId, staffId: row.id, action: "staff.status", actorId: s.userId, actorName: s.name, detail: `${row.firstName} ${row.lastName} marked ${status}` });
  await audit(s, "update", "staff", `Marked ${row.firstName} ${row.lastName} as ${status}`, row.id);
  revalidatePath("/app/staff");
  revalidatePath(`/app/staff/${row.id}`);
  return { ok: true, message: status === "left" ? "Marked as left" : "Status saved" };
}

/** Link a staff record to an existing team login (so they get My pay). */
export async function linkStaffLogin(staffId: string, userId: string | null): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  const staff = await db.staffMember.findFirst({ where: { id: String(staffId), churchId: s.churchId }, select: { id: true, userId: true, firstName: true } });
  if (!staff) return { ok: false, error: "Staff record not found." };
  if (userId) {
    const user = await db.user.findFirst({ where: { id: String(userId), churchId: s.churchId }, select: { id: true, name: true } });
    if (!user) return { ok: false, error: "That person is not on your team." };
    const taken = await db.staffMember.findFirst({ where: { userId: user.id, id: { not: staff.id } }, select: { id: true } });
    if (taken) return { ok: false, error: "That login is already linked to another staff record." };
    await db.staffMember.update({ where: { id: staff.id }, data: { userId: user.id } });
    await writeEvent(db, { churchId: s.churchId, staffId: staff.id, action: "staff.login_linked", actorId: s.userId, actorName: s.name, detail: `Linked ${staff.firstName} to the login of ${user.name}` });
  } else {
    await db.staffMember.update({ where: { id: staff.id }, data: { userId: null } });
    await writeEvent(db, { churchId: s.churchId, staffId: staff.id, action: "staff.login_unlinked", actorId: s.userId, actorName: s.name, detail: `Unlinked the login of ${staff.firstName}` });
  }
  revalidatePath(`/app/staff/${staff.id}`);
  return { ok: true, message: userId ? "Login linked" : "Login unlinked" };
}

/** Give a staff member their own "My pay" login (not a team seat). Copies the budget-leader invite. */
export async function inviteStaffToPortal(staffId: string): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  try {
    const settings = await ensureSettings(db, s.churchId);
    if (!settings.portalOn) return { ok: false, error: "The staff portal is switched off in Payroll settings." };
    const staff = await db.staffMember.findFirst({ where: { id: String(staffId), churchId: s.churchId }, select: { id: true, firstName: true, lastName: true, phone: true, email: true, userId: true, status: true } });
    if (!staff) return { ok: false, error: "Staff record not found." };
    if (staff.status === "left") return { ok: false, error: "They have left. Portal access is only for current staff." };
    if (staff.userId) return { ok: false, error: "They already have a login linked." };
    const phone = normalisePhone(staff.phone ?? "");
    if (phone.length < 10) return { ok: false, error: "Add a valid mobile number to their staff record first. The invite goes by text." };
    const email = (staff.email ?? "").toLowerCase().trim() || `p${phone.replace(/\D/g, "")}@invite.worshiphq.app`;
    if (await db.user.findUnique({ where: { email } })) return { ok: false, error: "Someone already uses that email on WorshipHQ. Link their existing login instead." };
    if (await db.user.findFirst({ where: { churchId: s.churchId, phone } })) return { ok: false, error: "Someone on your team already has that number. Link their existing login instead." };
    const { rateLimit, DAY } = await import("@/lib/rate-limit");
    if (!(await rateLimit(`invite:${s.churchId}`, 30, DAY))) return { ok: false, error: "That is a lot of invites for one day. Please try again tomorrow." };

    const inviteToken = crypto.randomBytes(24).toString("base64url");
    const name = `${staff.firstName} ${staff.lastName}`.trim();
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { churchId: s.churchId, email, name, phone, role: "Volunteer", staffPortalOnly: true, inviteToken } });
      await tx.staffMember.update({ where: { id: staff.id }, data: { userId: user.id } });
      await writeEvent(tx, { churchId: s.churchId, staffId: staff.id, action: "staff.portal_invited", actorId: s.userId, actorName: s.name, detail: `Sent ${name} a staff portal invite` });
    });
    const church = await db.church.findUnique({ where: { id: s.churchId }, select: { name: true } });
    const { getBaseUrl } = await import("@/lib/url");
    const { sendSms } = await import("@/lib/integrations/sms");
    const sent = await sendSms(phone, `${church?.name ?? "Your church"} has given you a WorshipHQ staff login to see your payslips and request leave. Set it up: ${await getBaseUrl()}/invite/${inviteToken}`, { heading: null });
    revalidatePath(`/app/staff/${staff.id}`);
    if (!sent.ok && !sent.stubbed) return { ok: false, error: `The login was made, but the text did not go (${sent.error ?? "the number was refused"}).` };
    return { ok: true, message: `Invite sent to ${staff.firstName}` };
  } catch (e) {
    return errorResult(e);
  }
}

/** Take away a staff portal login (deletes a portal-only user; just unlinks a team member). */
export async function revokeStaffPortal(staffId: string): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  const staff = await db.staffMember.findFirst({ where: { id: String(staffId), churchId: s.churchId }, select: { id: true, userId: true, firstName: true } });
  if (!staff?.userId) return { ok: false, error: "They have no login linked." };
  const user = await db.user.findFirst({ where: { id: staff.userId, churchId: s.churchId }, select: { id: true, staffPortalOnly: true } });
  await db.staffMember.update({ where: { id: staff.id }, data: { userId: null } });
  if (user?.staffPortalOnly) await db.user.deleteMany({ where: { id: user.id, churchId: s.churchId, staffPortalOnly: true } });
  await writeEvent(db, { churchId: s.churchId, staffId: staff.id, action: "staff.portal_revoked", actorId: s.userId, actorName: s.name, detail: `Removed the staff login of ${staff.firstName}` });
  revalidatePath(`/app/staff/${staff.id}`);
  return { ok: true, message: "Login removed" };
}

/** Delete a staff record. Not the recycle bin: a snapshot would hold ID numbers that Admins could read back. */
export async function deleteStaff(id: string): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  const staff = await db.staffMember.findFirst({ where: { id: String(id), churchId: s.churchId }, select: { id: true, firstName: true, lastName: true, staffNo: true, userId: true, documents: { select: { objectKey: true } } } });
  if (!staff) return { ok: false, error: "Staff record not found." };
  const paid = await db.payrollLine.count({ where: { churchId: s.churchId, staffId: staff.id, run: { status: { in: ["paid", "approved", "review"] } } } });
  if (paid) return { ok: false, error: "They have been paid through payroll. Mark them as Left instead, so their records stay." };
  if (staff.userId) {
    await db.user.deleteMany({ where: { id: staff.userId, churchId: s.churchId, staffPortalOnly: true } });
  }
  await db.staffMember.delete({ where: { id: staff.id } });
  if (staff.documents.length) {
    const { deleteObject } = await import("@/lib/storage");
    for (const d of staff.documents) await deleteObject(d.objectKey).catch(() => {});
  }
  await writeEvent(db, { churchId: s.churchId, action: "staff.deleted", actorId: s.userId, actorName: s.name, detail: `Deleted the staff record of ${staff.firstName} ${staff.lastName} (${staff.staffNo ?? "no number"})` });
  await audit(s, "delete", "staff", `Deleted staff record ${staff.staffNo ?? ""}`.trim(), staff.id);
  revalidatePath("/app/staff");
  return { ok: true, message: "Staff record deleted" };
}

export async function deleteStaffDocument(id: string): Promise<ActionResult> {
  const session = await staffActor("view");
  if (!session.ok) return session;
  const s = session.session;
  const doc = await db.staffDocument.findFirst({ where: { id: String(id), churchId: s.churchId }, select: { id: true, objectKey: true, payrollOnly: true, staffId: true, name: true } });
  if (!doc) return { ok: false, error: "Document not found." };
  const allowed = doc.payrollOnly ? (await payrollActor("manage")).ok : (await staffActor("manage")).ok;
  if (!allowed) return { ok: false, error: doc.payrollOnly ? "Only payroll managers can remove this document." : "Your role cannot change staff records." };
  await db.staffDocument.delete({ where: { id: doc.id } });
  const { deleteObject } = await import("@/lib/storage");
  await deleteObject(doc.objectKey).catch(() => {});
  await writeEvent(db, { churchId: s.churchId, staffId: doc.staffId, action: "doc.deleted", actorId: s.userId, actorName: s.name, detail: `Removed document "${doc.name.slice(0, 80)}"` });
  revalidatePath(`/app/staff/${doc.staffId}`);
  return { ok: true, message: "Document removed" };
}

