"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { moveToBin } from "@/lib/recycle-bin";
import { requireSession, assertCanWrite, hashPassword, verifyPassword, startUserSession } from "@/lib/auth";
import { passwordMeetsPolicy } from "@/lib/password-policy";
import { getFormDefinition, getVisitorFormDefinition } from "@/lib/forms/registration";
import crypto from "node:crypto";
import { sendSms } from "@/lib/integrations/sms";
import { sendOtp, verifyOtp } from "@/lib/auth/otp";
import { normalisePhone, phoneVariants } from "@/lib/phone";
import { initializePayment, newPaymentReference, SETTLEMENT_CURRENCY } from "@/lib/integrations/paystack";
import { env } from "@/lib/env";
import type { Role } from "@prisma/client";
import { sendEmail } from "@/lib/integrations/email";
import { audit } from "@/lib/audit";
import { getBaseUrl } from "@/lib/url";
import { planRank, type PlanId } from "@/lib/plan-gate";
import { sendUpgradeReceipt } from "@/lib/billing/receipt";
import { ownedId } from "@/lib/tenant";
import { escapeHtml } from "@/lib/html";

/** Update the signed-in user's own name and profile photo. The login email only changes through startEmailChange (password + code). */
export async function updateProfile(formData: FormData) {
  const session = await requireSession();
  // Demo and impersonation sessions aren't backed by a real user row.
  if (session.isDemo || session.impersonating) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const data: { name: string; photoUrl?: string | null } = { name };

  // Profile photo (data URL or empty to clear). Uploaded to Storage → URL.
  if (formData.has("photoUrl")) {
    const photo = String(formData.get("photoUrl") ?? "");
    if (!photo) data.photoUrl = null;
    else if (photo.startsWith("data:image/") && photo.length < 1_500_000) {
      const { storeImage } = await import("@/lib/storage");
      data.photoUrl = await storeImage(photo, "staff");
    }
  }

  await db.user.update({ where: { id: session.userId }, data });

  revalidatePath("/app/account");
  revalidatePath("/app", "layout");
}

/** Change the signed-in user's password (requires current password). */
export async function changePassword(formData: FormData) {
  const session = await requireSession();
  if (session.isDemo || session.impersonating) return { ok: false, error: "Not available here." };

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!passwordMeetsPolicy(next)) return { ok: false, error: "Password needs 8+ characters with a capital letter, a number and a symbol." };

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await verifyPassword(current, user.passwordHash))) {
    return { ok: false, error: "Your current password is incorrect." };
  }

  // A new password signs out every other browser and device; this one gets a fresh session.
  await db.user.update({
    where: { id: session.userId },
    data: { passwordHash: await hashPassword(next), sessionVersion: { increment: 1 } },
  });
  await startUserSession(session.userId);
  return { ok: true };
}

export async function sendPasswordResetOtp() {
  const session = await requireSession();
  if (session.isDemo || session.impersonating) return { ok: false, error: "Not available." };

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { phone: true, phoneVerified: true } });
  if (!user?.phone || !user.phoneVerified) return { ok: false, error: "No verified phone on this account." };

  const result = await sendOtp({ phone: user.phone, purpose: "reset-password", userId: session.userId });
  if (!result.ok) return { ok: false, error: result.limited ? result.error : "Couldn't send SMS." };
  return { ok: true, verificationId: result.verificationId };
}

export async function resetPasswordWithOtp(formData: FormData) {
  const session = await requireSession();
  if (session.isDemo || session.impersonating) return { ok: false, error: "Not available." };

  const vid = String(formData.get("verificationId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const next = String(formData.get("next") ?? "");
  if (!passwordMeetsPolicy(next)) return { ok: false, error: "Password needs 8+ characters with a capital letter, a number and a symbol." };

  const result = await verifyOtp(vid, code, { purpose: "reset-password", userId: session.userId });
  if (!result.ok) return { ok: false, error: result.error ?? "Invalid code." };

  await db.user.update({
    where: { id: session.userId },
    data: { passwordHash: await hashPassword(next), sessionVersion: { increment: 1 } },
  });
  await startUserSession(session.userId);
  return { ok: true };
}

export async function startPhoneChange(formData: FormData) {
  const session = await requireSession();
  if (session.isDemo || session.impersonating) return { ok: false, error: "Not available." };

  const password = String(formData.get("password") ?? "");
  const newPhone = String(formData.get("newPhone") ?? "").trim();
  if (!newPhone) return { ok: false, error: "Phone number required." };

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: "Incorrect password." };
  }

  const taken = await db.user.findFirst({ where: { phone: { in: phoneVariants(newPhone) }, id: { not: session.userId } } });
  if (taken) return { ok: false, error: "This phone number is already in use." };

  const result = await sendOtp({ phone: newPhone, purpose: "verify-phone", userId: session.userId });
  if (!result.ok) return { ok: false, error: result.limited ? result.error : "Couldn't send verification SMS." };
  return { ok: true, verificationId: result.verificationId };
}

export async function confirmPhoneChange(formData: FormData) {
  const session = await requireSession();
  if (session.isDemo || session.impersonating) return { ok: false, error: "Not available." };

  const vid = String(formData.get("verificationId") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  // Save the number the code actually went to, never one sent back with the form.
  const result = await verifyOtp(vid, code, { purpose: "verify-phone", userId: session.userId });
  if (!result.ok || !result.phone) return { ok: false, error: result.error ?? "Invalid code." };
  const taken = await db.user.findFirst({ where: { phone: { in: phoneVariants(result.phone) }, id: { not: session.userId } } });
  if (taken) return { ok: false, error: "This phone number is already in use." };

  await db.user.update({
    where: { id: session.userId },
    data: { phone: result.phone, phoneVerified: true },
  });
  revalidatePath("/app/account");
  return { ok: true };
}

export async function startEmailChange(formData: FormData) {
  const session = await requireSession();
  if (session.isDemo || session.impersonating) return { ok: false, error: "Not available." };

  const password = String(formData.get("password") ?? "");
  const newEmail = String(formData.get("newEmail") ?? "").toLowerCase().trim();
  if (!newEmail || !newEmail.includes("@")) return { ok: false, error: "Valid email required." };

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: "Incorrect password." };
  }

  const taken = await db.user.findUnique({ where: { email: newEmail } });
  if (taken) return { ok: false, error: "This email is already in use." };

  const result = await sendOtp({ channel: "email", email: newEmail, purpose: "verify-email", userId: session.userId });
  if (!result.ok) return { ok: false, error: result.limited ? result.error : "Couldn't send verification email." };
  return { ok: true, verificationId: result.verificationId };
}

export async function confirmEmailChange(formData: FormData) {
  const session = await requireSession();
  if (session.isDemo || session.impersonating) return { ok: false, error: "Not available." };

  const vid = String(formData.get("verificationId") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  // Save the address the code actually went to, never one sent back with the form.
  const result = await verifyOtp(vid, code, { purpose: "verify-email", userId: session.userId });
  if (!result.ok || !result.phone) return { ok: false, error: result.error ?? "Invalid code." };
  const newEmail = result.phone;
  const taken = await db.user.findUnique({ where: { email: newEmail } });
  if (taken && taken.id !== session.userId) return { ok: false, error: "This email is already in use." };

  await db.user.update({
    where: { id: session.userId },
    data: { email: newEmail, emailVerified: true },
  });
  revalidatePath("/app/account");
  return { ok: true };
}

export async function updateChurch(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await db.church.update({
    where: { id: session.churchId },
    data: {
      name,
      denomination: String(formData.get("denomination") ?? "").trim() || null,
      city: String(formData.get("city") ?? "").trim() || null,
      country: String(formData.get("country") ?? "Ghana").trim() || "Ghana",
      address: String(formData.get("address") ?? "").trim() || null,
      // Admins get SMS+email when a member submits a prayer/testimony/counselling.
      notifySubmissions: formData.get("notifySubmissions") === "on",
      // Money shows as *** until someone taps the eye icon.
      hideAmounts: formData.get("hideAmounts") === "on",
      // Weekly upcoming-birthdays digest to admins.
      birthdayDigestOn: formData.get("birthdayDigestOn") === "on",
      birthdayDigestDay: (() => { const d = parseInt(String(formData.get("birthdayDigestDay") ?? "1")); return Number.isFinite(d) && d >= 0 && d <= 6 ? d : 1; })(),
      // logoUrl is managed in the Branding tab (updateBranding), not here.
    },
  });

  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
}
export async function requestSenderId(input: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return { ok: false, error: "Only the owner or an admin can request a sender ID." };

  // A custom sender name is a Pro feature (each one needs approval from the networks).
  const sub = await db.subscription.findUnique({ where: { churchId: session.churchId }, select: { plan: true } });
  if (!sub || planRank(sub.plan as PlanId) < planRank("pro")) return { ok: false, error: "A custom sender ID is part of the Pro plan and above. Upgrade to request one." };

  const senderId = String(input ?? "").trim();
  if (!/^[A-Za-z0-9]{3,11}$/.test(senderId) || /^\d+$/.test(senderId)) {
    return { ok: false, error: "Use 3 to 11 letters and numbers, with no spaces or symbols, and at least one letter." };
  }

  await db.church.update({
    where: { id: session.churchId },
    data: {
      smsSenderId: senderId,
      smsSenderIdStatus: "pending",
      smsSenderIdRequestedAt: new Date(),
    },
  });
  const church = await db.church.findUnique({
    where: { id: session.churchId },
    select: { name: true },
  });

  const result = await sendSms(
    "0247258161",
    `New Sender ID request

Church: ${church?.name ?? "Unknown"}
Requested ID: ${senderId}`,
    { heading: null }
  );

  revalidatePath("/app/settings");
  return { ok: true };
}
export async function updateBranding(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const accentColor = String(formData.get("accentColor") ?? "#0d7377");
  // logoUrl is a data URL (base64) or empty to clear. Cap size (~1.5MB base64).
  const logoRaw = String(formData.get("logoUrl") ?? "");
  const data: { accentColor: string; logoUrl?: string | null } = { accentColor };
  if (formData.has("logoUrl")) {
    if (!logoRaw) data.logoUrl = null;
    else if (logoRaw.startsWith("data:image/") && logoRaw.length < 1_500_000) {
      const { storeImage } = await import("@/lib/storage");
      data.logoUrl = await storeImage(logoRaw, "logos");
    }
  }

  await db.church.update({ where: { id: session.churchId }, data });
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
}

/** Save the full registration form definition (from the form builder). */
export async function updateSlug(newSlug: string) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return { error: "Only admins can change the link" };

  const slug = newSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (slug.length < 3) return { error: "Link must be at least 3 characters" };
  if (slug.length > 60) return { error: "Link must be 60 characters or fewer" };

  const existing = await db.church.findUnique({ where: { slug } });
  if (existing && existing.id !== session.churchId) return { error: "This link is already taken by another church" };

  await db.church.update({ where: { id: session.churchId }, data: { slug } });
  revalidatePath("/app/settings");
  return { ok: true, slug };
}

const BUILT_IN_ROLES: Role[] = ["Owner", "Admin", "Pastor", "Finance", "Media", "Leader", "Volunteer"];

/** A role <select> value is either a built-in enum or "custom:<id>". */
function parseRoleValue(value: string): { role: Role; customRoleId: string | null } {
  if (value.startsWith("custom:")) return { role: "Volunteer", customRoleId: value.slice(7) };
  const role = (BUILT_IN_ROLES.includes(value as Role) ? value : "Volunteer") as Role;
  return { role, customRoleId: null };
}

/** Invite a teammate - creates a User in this church with a temporary password. */
export async function inviteTeammate(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  const name = String(formData.get("name") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").toLowerCase().trim();
  const phone = normalisePhone(String(formData.get("phone") ?? ""));
  const parsedRole = parseRoleValue(String(formData.get("role") ?? "Volunteer"));
  const role = parsedRole.role;
  const customRoleId = await ownedId("customRole", parsedRole.customRoleId, session.churchId);
  if (!name || phone.length < 10) return;

  // Email is the login identifier but optional to type - synthesize a stable
  // placeholder from the phone when the admin doesn't provide one.
  const email = emailRaw || `p${phone.replace(/\D/g, "")}@invite.worshiphq.app`;

  if (await db.user.findUnique({ where: { email } })) return;
  if (await db.user.findFirst({ where: { churchId: session.churchId, phone } })) return;

  // The plan's team size is enforced here, not just shown. Invites are also capped per day: each one is a text we pay for.
  if (!(await teamHasRoom(session.churchId))) return;
  const { rateLimit, DAY } = await import("@/lib/rate-limit");
  if (!(await rateLimit(`invite:${session.churchId}`, 30, DAY))) return;

  // Optional temp password lets them also sign in immediately; otherwise they
  // set their own password when accepting the invite.
  const tempPassword = String(formData.get("password") ?? "").trim();
  const inviteToken = crypto.randomBytes(24).toString("base64url");

  await db.user.create({
    data: {
      churchId: session.churchId,
      email,
      name,
      phone,
      role,
      customRoleId,
      inviteToken,
      passwordHash: tempPassword ? await hashPassword(tempPassword) : null,
    },
  });

  const church = await db.church.findUnique({ where: { id: session.churchId }, select: { name: true } });
  const churchName = church?.name ?? "WorshipHQ";
  const appUrl = await getBaseUrl();
  const acceptUrl = `${appUrl}/invite/${inviteToken}`;

  // SMS is the reliable delivery channel. Keep it short (1 credit where possible).
  await sendSms(
    phone,
    `You've been invited to join ${churchName} on WorshipHQ${role ? ` as ${role}` : ""}. Accept & set up your account: ${acceptUrl}`,
    { heading: null },
  );

  // Also email when a real address was given (delivers only if email is configured).
  if (emailRaw) {
    await sendEmail({
      to: emailRaw,
      subject: `You've been invited to ${churchName}`,
      html: `
        <h2>Welcome to ${escapeHtml(churchName)}</h2>
        <p>You've been invited to join the team on WorshipHQ${role ? ` as <strong>${role}</strong>` : ""}.</p>
        <p><a href="${acceptUrl}">Accept your invite & set up your account →</a></p>
        ${tempPassword ? `<p>Or sign in with <strong>${escapeHtml(email)}</strong> and the temporary password you were given.</p>` : ""}
      `,
      log: { churchId: session.churchId, name: `Team invite: ${name}`, segment: "invite" },
    });
  }

  revalidatePath("/app/settings");
}

/** Whether the church's plan has room for one more team member. */
async function teamHasRoom(churchId: string): Promise<boolean> {
  const { getChurchPlan } = await import("@/lib/plan-gate-server");
  const { getPlatformConfig } = await import("@/lib/data/platform-config");
  const [plan, cfg, count] = await Promise.all([
    getChurchPlan(churchId),
    getPlatformConfig(),
    db.user.count({ where: { churchId } }),
  ]);
  const limit = cfg.planTable[plan]?.teamUsers ?? Infinity;
  return !Number.isFinite(limit) || count < limit;
}

/** Invite a department budget leader - a scoped account that only ever sees its
 *  own department's budget, income and expenses. Uses the same SMS accept flow. */
export async function inviteBudgetLeader(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  const name = String(formData.get("name") ?? "").trim();
  const phone = normalisePhone(String(formData.get("phone") ?? ""));
  const emailRaw = String(formData.get("email") ?? "").toLowerCase().trim();
  const departmentId = String(formData.get("departmentId") ?? "").trim();
  if (!name || phone.length < 10 || !departmentId) return;

  const dept = await db.department.findFirst({ where: { id: departmentId, churchId: session.churchId }, select: { id: true, name: true } });
  if (!dept) return;

  const email = emailRaw || `p${phone.replace(/\D/g, "")}@invite.worshiphq.app`;
  if (await db.user.findUnique({ where: { email } })) return;
  if (await db.user.findFirst({ where: { churchId: session.churchId, phone } })) return;

  // The plan's team size is enforced here, not just shown. Invites are also capped per day: each one is a text we pay for.
  if (!(await teamHasRoom(session.churchId))) return;
  const { rateLimit, DAY } = await import("@/lib/rate-limit");
  if (!(await rateLimit(`invite:${session.churchId}`, 30, DAY))) return;

  const inviteToken = crypto.randomBytes(24).toString("base64url");
  await db.user.create({
    data: {
      churchId: session.churchId,
      email,
      name,
      phone,
      role: "Volunteer",
      budgetDepartmentId: dept.id,
      inviteToken,
    },
  });

  const church = await db.church.findUnique({ where: { id: session.churchId }, select: { name: true } });
  const appUrl = await getBaseUrl();
  const acceptUrl = `${appUrl}/invite/${inviteToken}`;
  await sendSms(
    phone,
    `You've been made ${dept.name} budget leader at ${church?.name ?? "your church"} on WorshipHQ. Set up your account: ${acceptUrl}`,
    { heading: null },
  );

  revalidatePath("/app/settings");
}

/** Change a team member's role (Owner/Admin only). */
export async function changeUserRole(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  const userId = String(formData.get("userId") ?? "").trim();
  const value = String(formData.get("role") ?? "").trim();
  if (!userId || !value) return;

  // Can't change your own role
  if (userId === session.userId) return;
  const parsedRole = parseRoleValue(value);
  const role = parsedRole.role;
  const customRoleId = await ownedId("customRole", parsedRole.customRoleId, session.churchId);
  if (parsedRole.customRoleId && !customRoleId) return;
  // Only Owner can make someone else Owner
  if (role === "Owner" && session.role !== "Owner") return;
  // Only an Owner can change an Owner's role.
  const current = await db.user.findFirst({ where: { id: userId, churchId: session.churchId }, select: { role: true } });
  if (current?.role === "Owner" && session.role !== "Owner") return;

  const target = await db.user.findFirst({ where: { id: userId, churchId: session.churchId }, select: { name: true } });
  await db.user.updateMany({
    where: { id: userId, churchId: session.churchId },
    data: { role, customRoleId },
  });

  await audit(session, "update", "user", `Changed ${target?.name ?? "a member"}'s role to ${role}`, userId);
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
}

/** Create a custom role with section access + delete permission (Owner/Admin). */
export async function createCustomRole(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const sections = formData.getAll("sections").map(String);
  // A section can only be managed if it's also viewable - keep them consistent.
  const manageSections = formData.getAll("manageSections").map(String).filter((s) => sections.includes(s));
  const canDelete = formData.get("canDelete") === "on" || formData.get("canDelete") === "yes";

  await db.customRole.upsert({
    where: { churchId_name: { churchId: session.churchId, name } },
    create: { churchId: session.churchId, name, sections, manageSections, canDelete, manageSplit: true },
    update: { sections, manageSections, canDelete, manageSplit: true },
  });

  await audit(session, "create", "role", `Saved custom role "${name}"`);

  await audit(session, "create", "role", `Saved custom role "${name}"`);
  revalidatePath("/app/settings");
}

export async function updateRolePermissions(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  const role = String(formData.get("role") ?? "").trim();
  if (!role) return;

  const sections = formData.getAll("sections").map(String);
  const church = await db.church.findUnique({
    where: { id: session.churchId },
    select: { rolePermissions: true },
  });
  const current = (church?.rolePermissions as Record<string, string[]> | null) ?? {};
  current[role] = sections;

  await db.church.update({
    where: { id: session.churchId },
    data: { rolePermissions: current },
  });

  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
}

/** Edit an existing custom role's name, sections and delete permission. */
export async function updateCustomRole(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  const role = await db.customRole.findFirst({
    where: { id, churchId: session.churchId },
    select: { id: true },
  });
  if (!role) return;

  const sections = formData.getAll("sections").map(String);
  const manageSections = formData.getAll("manageSections").map(String).filter((s) => sections.includes(s));
  const canDelete = formData.get("canDelete") === "on" || formData.get("canDelete") === "yes";

  await db.customRole.update({
    where: { id },
    data: { name, sections, manageSections, canDelete, manageSplit: true },
  });

  revalidatePath("/app/settings");
  // Anyone signed in with this role needs their nav re-resolved.
  revalidatePath("/app", "layout");
}

export async function deleteCustomRole(id: string) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;
  await moveToBin(session, "customRole", "CustomRole", id);
  // Detach any users on this role first (they fall back to their base role).
  await db.user.updateMany({ where: { customRoleId: id, churchId: session.churchId }, data: { customRoleId: null } });
  await db.customRole.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
}

/** Remove a team member (Owner/Admin only, can't remove yourself). */
export async function removeTeamMember(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId || userId === session.userId) return;

  // Can't remove Owner
  const target = await db.user.findFirst({ where: { id: userId, churchId: session.churchId } });
  if (!target || target.role === "Owner") return;

  await moveToBin(session, "teamMember", "User", userId);
  await db.user.delete({ where: { id: userId } });
  revalidatePath("/app/settings");
}

/** Undo a scheduled downgrade before it takes effect. */
export async function cancelScheduledChange() {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner") return { error: "Only the church owner can change plans" };

  await db.subscription.update({
    where: { churchId: session.churchId },
    data: { scheduledPlan: null, scheduledAt: null, cancelAtPeriodEnd: false },
  });
  revalidatePath("/app/settings");
  return { ok: true as const };
}

/** What would this plan change cost? Drives the confirmation dialog. */
export async function previewPlanChangeAction(plan: string, interval: "monthly" | "yearly") {
  const session = await requireSession();

  const { plans } = await import("@/config/pricing");
  const { getPlatformConfig } = await import("@/lib/data/platform-config");
  const { previewPlanChange } = await import("@/lib/billing/periods");

  const [sub, platformConfig, lastPayment] = await Promise.all([
    db.subscription.findUnique({ where: { churchId: session.churchId } }),
    getPlatformConfig(),
    db.planPayment.findFirst({
      where: { churchId: session.churchId, status: "paid" },
      orderBy: { paidAt: "desc" },
      select: { amountUsd: true },
    }),
  ]);

  const cfg = plans.find((p) => p.id === plan);
  const dbPrice = platformConfig.prices[plan];
  const listPrice = plan === "free"
    ? 0
    : interval === "yearly" ? (dbPrice?.yearly ?? cfg?.yearly ?? 0) : (dbPrice?.monthly ?? cfg?.monthly ?? 0);

  const preview = previewPlanChange({
    currentPlan: sub?.plan ?? "free",
    newPlan: plan,
    interval,
    periodEnd: sub?.renewsAt ?? null,
    amountPaidUsd: lastPayment?.amountUsd ?? 0,
    newPlanPriceUsd: listPrice,
  });

  return {
    direction: preview.direction,
    amountDueUsd: preview.amountDueUsd,
    listPrice,
    daysLeft: preview.daysLeft,
    unusedCreditUsd: preview.unusedCreditUsd,
    effectiveDate: preview.effectiveDate.toISOString(),
    summary: preview.summary,
    symbol: platformConfig.currencySymbol,
  };
}

/** Check a discount code and show what the church would actually pay. */
export async function previewCoupon(code: string, plan: string, interval: "monthly" | "yearly") {
  const session = await requireSession();

  const { plans } = await import("@/config/pricing");
  const planConfig = plans.find((p) => p.id === plan);
  if (!planConfig) return { ok: false as const, error: "Invalid plan." };

  const { getPlatformConfig } = await import("@/lib/data/platform-config");
  const platformConfig = await getPlatformConfig();
  const dbPrice = platformConfig.prices[plan];
  const listAmount = interval === "yearly" ? (dbPrice?.yearly ?? planConfig.yearly) : (dbPrice?.monthly ?? planConfig.monthly);

  const { checkCoupon } = await import("@/lib/billing/coupons");
  const check = await checkCoupon({
    code,
    churchId: session.churchId,
    plan,
    interval,
    amount: listAmount,
  });
  if (!check.ok) return { ok: false as const, error: check.error ?? "Invalid coupon." };

  return {
    ok: true as const,
    label: check.label!,
    listAmount,
    newAmount: check.newAmount!,
    saved: check.saved!,
    symbol: platformConfig.currencySymbol,
  };
}

export async function changePlan(
  plan: string,
  interval: "monthly" | "yearly",
  couponCode?: string,
) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner") return { error: "Only the church owner can change plans" };

  const validPlans = ["free", "starter", "pro", "max"];
  if (!validPlans.includes(plan)) return { error: "Invalid plan" };

  const existing = await db.subscription.findUnique({ where: { churchId: session.churchId } });
  if (existing?.status === "grace") return { error: "Your plan cannot be changed (Gift of Grace)" };

  const { plans } = await import("@/config/pricing");
  const { getPlatformConfig } = await import("@/lib/data/platform-config");
  const platformConfig = await getPlatformConfig();

  // ── Work out whether this is an upgrade (pay the difference) or a downgrade
  //    (schedule it for period end - no money moves either way). ──
  const { previewPlanChange } = await import("@/lib/billing/periods");
  const lastPayment = await db.planPayment.findFirst({
    where: { churchId: session.churchId, status: "paid" },
    orderBy: { paidAt: "desc" },
    select: { amountUsd: true },
  });
  const targetConfig = plans.find((p) => p.id === plan);
  const targetDbPrice = platformConfig.prices[plan];
  const targetList = plan === "free"
    ? 0
    : interval === "yearly"
      ? (targetDbPrice?.yearly ?? targetConfig?.yearly ?? 0)
      : (targetDbPrice?.monthly ?? targetConfig?.monthly ?? 0);

  const preview = previewPlanChange({
    currentPlan: existing?.plan ?? "free",
    newPlan: plan,
    interval,
    periodEnd: existing?.renewsAt ?? null,
    amountPaidUsd: lastPayment?.amountUsd ?? 0,
    newPlanPriceUsd: targetList,
  });

  if (preview.direction === "same") return { error: "You're already on this plan." };

  // ── Downgrade: never charges, never refunds. Scheduled for period end. ──
  if (preview.direction === "downgrade") {
    const stillInPaidPeriod = existing?.renewsAt && existing.renewsAt.getTime() > Date.now();
    if (stillInPaidPeriod) {
      await db.subscription.update({
        where: { churchId: session.churchId },
        data: {
          scheduledPlan: plan,
          scheduledAt: new Date(),
          cancelAtPeriodEnd: plan === "free",
        },
      });
      revalidatePath("/app/settings");
      revalidatePath("/app", "layout");
      return {
        ok: true as const,
        scheduled: true as const,
        plan,
        effectiveDate: preview.effectiveDate.toISOString(),
        summary: preview.summary,
      };
    }
    // No paid time left - apply straight away.
    await db.subscription.upsert({
      where: { churchId: session.churchId },
      create: { churchId: session.churchId, plan, interval: "monthly", status: "active" },
      update: { plan, interval: "monthly", status: "active", renewsAt: null, scheduledPlan: null, cancelAtPeriodEnd: false },
    });
    revalidatePath("/app/settings");
    revalidatePath("/app", "layout");
    return { ok: true as const, plan };
  }

  const planConfig = targetConfig;
  if (!planConfig) return { error: "Invalid plan" };

  // Upgrades charge only the prorated difference; new purchases pay full price.
  const listAmount = preview.direction === "upgrade" ? preview.amountDueUsd : targetList;
  const isProratedUpgrade = preview.direction === "upgrade";

  // Apply a SuperAdmin-issued discount code, if one was entered.
  let amount = listAmount;
  let couponId: string | null = null;
  if (couponCode?.trim()) {
    const { checkCoupon } = await import("@/lib/billing/coupons");
    const check = await checkCoupon({
      code: couponCode,
      churchId: session.churchId,
      plan,
      interval,
      amount: listAmount,
    });
    if (!check.ok) return { error: check.error ?? "That coupon isn't valid." };
    amount = check.newAmount ?? listAmount;
    couponId = check.couponId ?? null;
  }

  // Prices are displayed in USD; Paystack (Ghana) charges the GHS equivalent.
  const chargeAmountGhs = Math.round(amount * platformConfig.usdToGhsRate);

  // A 100%-off coupon means nothing to charge - activate straight away.
  if (couponId && chargeAmountGhs <= 0) {
    const { redeemCoupon } = await import("@/lib/billing/coupons");
    if (!(await redeemCoupon(couponId, session.churchId))) {
      return { error: "This coupon has already been used." };
    }
    const periodStart = new Date();
    const renewsAt = new Date();
    renewsAt.setMonth(renewsAt.getMonth() + (interval === "yearly" ? 12 : 1));
    await db.subscription.upsert({
      where: { churchId: session.churchId },
      create: { churchId: session.churchId, plan, interval, status: "active", renewsAt },
      update: { plan, interval, status: "active", renewsAt },
    });
    // Zero-value payment, but still a ledger entry so billing history is complete.
    const { recordPlanPayment } = await import("@/lib/billing/payments");
    await recordPlanPayment({
      churchId: session.churchId,
      reference: `COUPON-${couponId}-${Date.now()}`,
      plan, interval,
      amountUsd: 0, amountGhs: 0,
      usdToGhsRate: platformConfig.usdToGhsRate,
      couponId, discountUsd: listAmount,
      periodStart, periodEnd: renewsAt,
    });
    await sendUpgradeReceipt(session.churchId, planConfig.name, "Free (100% coupon)", interval, `COUPON-${Date.now()}`);
    revalidatePath("/app/settings");
    revalidatePath("/app", "layout");
    return { ok: true as const, plan };
  }
  const reference = newPaymentReference();
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const returnUrl = `${appUrl}/app/settings?upgraded=${plan}&ref=${reference}&interval=${interval}`;

  const init = await initializePayment({
    email: session.email || `billing+${session.churchId}@worshiphq.org`,
    amount: chargeAmountGhs,
    currency: SETTLEMENT_CURRENCY,
    reference,
    callbackUrl: returnUrl,
    stubReturnUrl: returnUrl,
    metadata: {
      kind: "plan_upgrade",
      churchId: session.churchId,
      plan,
      interval,
      displayAmountUsd: amount,
      listAmountUsd: listAmount,
      couponId,
      usdToGhsRate: platformConfig.usdToGhsRate,
      prorated: isProratedUpgrade,
    },
  });

  if (init.stubbed) {
    if (couponId) {
      const { redeemCoupon } = await import("@/lib/billing/coupons");
      await redeemCoupon(couponId, session.churchId);
    }
    const periodStart = existing?.periodStart ?? new Date();
    // A prorated upgrade buys the REMAINDER of the current period, so the
    // renewal date must not move.
    const renewsAt = isProratedUpgrade && existing?.renewsAt
      ? existing.renewsAt
      : (() => { const d = new Date(); d.setMonth(d.getMonth() + (interval === "yearly" ? 12 : 1)); return d; })();
    await db.subscription.upsert({
      where: { churchId: session.churchId },
      create: { churchId: session.churchId, plan, interval, status: "active", renewsAt, periodStart },
      update: { plan, interval, status: "active", renewsAt, periodStart, scheduledPlan: null, cancelAtPeriodEnd: false },
    });
    const { recordPlanPayment } = await import("@/lib/billing/payments");
    await recordPlanPayment({
      churchId: session.churchId,
      reference, plan, interval,
      amountUsd: amount, amountGhs: chargeAmountGhs,
      usdToGhsRate: platformConfig.usdToGhsRate,
      couponId, discountUsd: listAmount - amount,
      periodStart, periodEnd: renewsAt,
    });
    const sym = platformConfig.currencySymbol;
    await sendUpgradeReceipt(session.churchId, planConfig.name, `${sym}${amount.toLocaleString()} (₵${chargeAmountGhs.toLocaleString()})`, interval, reference);
    revalidatePath("/app/settings");
    revalidatePath("/app", "layout");
    return { ok: true, plan };
  }

  // Live mode: hand the payment init back so the client opens the in-app
  // Paystack popup, then confirms via verifyPlanUpgrade on success.
  if (init.ok && (init.accessCode || init.authorizationUrl)) {
    return { ok: true as const, plan, payment: init, couponId };
  }
  return { error: init.error ?? "Could not start payment. Please try again." };
}

/**
 * Back from Paystack checkout: confirm the charge with Paystack and switch the plan on. The plan,
 * interval and church come from the charge's own sealed metadata (see activatePlanPayment), so the
 * arguments are only used to tell the client what happened. Each reference only ever counts once.
 */
export async function verifyPlanUpgrade(
  reference: string,
  _plan: string,
  _interval: string,
  _couponId?: string | null,
) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.impersonating) return { error: "Support sessions can't confirm payments." };
  if (!reference || !/^[A-Za-z0-9_.=-]{6,100}$/.test(reference)) return { error: "Invalid payment reference." };
  if (!env.PAYSTACK_SECRET_KEY) return { error: "Payments are not configured." };

  let txn;
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
    });
    const data = await res.json();
    txn = data?.data;
    if (!txn || txn.status !== "success") {
      return { error: "Payment not confirmed yet. Please wait a moment and refresh." };
    }
  } catch {
    return { error: "Could not verify payment. Please refresh the page." };
  }

  const { activatePlanPayment } = await import("@/lib/billing/activate-plan");
  const result = await activatePlanPayment(txn, session.churchId);
  if (!result.ok) return { error: result.error };
  if (result.alreadyProcessed) return { ok: true, alreadyActive: true };

  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function redeemPlanBypass(code: string) {
  const session = await requireSession();
  assertCanWrite(session);

  const sub = await db.subscription.findUnique({ where: { churchId: session.churchId } });
  if (!sub || !sub.bypassPlan || !sub.bypassCode) {
    return { error: "No upgrade code found for your account" };
  }
  if (sub.bypassCode !== code.trim()) {
    return { error: "Invalid code. Please check and try again." };
  }

  const renewsAt = new Date();
  renewsAt.setFullYear(renewsAt.getFullYear() + 1);

  await db.subscription.update({
    where: { churchId: session.churchId },
    data: {
      plan: sub.bypassPlan,
      interval: "yearly",
      status: "active",
      renewsAt,
      bypassPlan: null,
      bypassCode: null,
    },
  });

  // A gift is part of the billing history too (so the church and the SuperAdmin can both see what happened).
  await db.planPayment.create({
    data: {
      churchId: session.churchId, reference: `GIFT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      plan: sub.bypassPlan, interval: "yearly", amountUsd: 0, amountGhs: 0, usdToGhsRate: 1, kind: "new",
      periodStart: new Date(), periodEnd: renewsAt, source: "granted", termMonths: 12, note: "Gift from WorshipHQ",
    },
  });

  const { plans } = await import("@/config/pricing");
  const planConfig = plans.find((p) => p.id === sub.bypassPlan);
  await sendUpgradeReceipt(session.churchId, planConfig?.name ?? sub.bypassPlan, "Free (SuperAdmin gift)", "yearly", `BYPASS-${Date.now()}`);

  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  return { ok: true, plan: sub.bypassPlan };
}
