"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { moveToBin } from "@/lib/recycle-bin";
import { requireSession, assertCanWrite, assertPlanFeature, hashPassword, verifyPassword, startUserSession } from "@/lib/auth";
import { passwordMeetsPolicy } from "@/lib/password-policy";
import { getFormDefinition, getVisitorFormDefinition } from "@/lib/forms/registration";
import crypto from "node:crypto";
import { sendSms } from "@/lib/integrations/sms";
import { sendOtp, verifyOtp } from "@/lib/auth/otp";
import { normalisePhone, phoneVariants } from "@/lib/phone";
import { initializePayment, newPaymentReference, SETTLEMENT_CURRENCY } from "@/lib/integrations/paystack";
import { getCollectionProvider, hubtelConfig } from "@/lib/billing/collection-provider";
import { initHubtelCheckout } from "@/lib/integrations/hubtel-pay";
import { env } from "@/lib/env";
import type { Role } from "@prisma/client";
import { sendEmail } from "@/lib/integrations/email";
import { audit } from "@/lib/audit";
import { getBaseUrl } from "@/lib/url";
import { planRank, effectivePlan, type PlanId } from "@/lib/plan-gate";
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
  if (session.role !== "Owner" && session.role !== "Admin") return { ok: false, error: "Only the Main Admin or an admin can request a sender ID." };

  // A custom sender name is a Max feature: each one needs approval from every network, which takes weeks and manual work.
  const sub = await db.subscription.findUnique({ where: { churchId: session.churchId }, select: { plan: true, status: true, renewsAt: true } });
  if (!sub || planRank(effectivePlan(sub)) < planRank("max")) return { ok: false, error: "A custom sender ID is part of the Max plan. Upgrade to request one." };

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
export type ActionResult = { ok: true } | { ok: false; error: string };

function parseRoleValue(value: string): { role: Role; customRoleId: string | null } {
  if (value.startsWith("custom:")) return { role: "Volunteer", customRoleId: value.slice(7) };
  const role = (BUILT_IN_ROLES.includes(value as Role) ? value : "Volunteer") as Role;
  return { role, customRoleId: null };
}

/** Invite a teammate - creates a User in this church with a temporary password. */
export async function inviteTeammate(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return { ok: false, error: "Only the Main Admin or an Admin can do this." };

  const name = String(formData.get("name") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").toLowerCase().trim();
  const phone = normalisePhone(String(formData.get("phone") ?? ""));
  const parsedRole = parseRoleValue(String(formData.get("role") ?? "Volunteer"));
  const role = parsedRole.role;
  const customRoleId = await ownedId("customRole", parsedRole.customRoleId, session.churchId);
  if (!name) return { ok: false, error: "Add their name." };
  if (phone.length < 10) return { ok: false, error: "Add a valid mobile number. The invite goes by text." };
  if (parsedRole.customRoleId && !customRoleId) return { ok: false, error: "That role no longer exists. Pick another." };
  // The Main Admin role is only ever handed over with "Transfer Main Admin", never by an invite.
  if (role === "Owner") return { ok: false, error: "The Main Admin role is handed over in Settings, not by invite." };

  // Email is the login identifier but optional to type - synthesize a stable
  // placeholder from the phone when the admin doesn't provide one.
  const email = emailRaw || `p${phone.replace(/\D/g, "")}@invite.worshiphq.app`;

  if (await db.user.findUnique({ where: { email } })) return { ok: false, error: "Someone already uses that email on WorshipHQ." };
  if (await db.user.findFirst({ where: { churchId: session.churchId, phone } })) return { ok: false, error: "Someone on your team already has that number." };

  // The plan's team size is enforced here, not just shown. Invites are also capped per day: each one is a text we pay for.
  if (!(await teamHasRoom(session.churchId))) return { ok: false, error: "Your plan's team is full. Upgrade in Billing to add more people." };
  const { rateLimit, DAY } = await import("@/lib/rate-limit");
  if (!(await rateLimit(`invite:${session.churchId}`, 30, DAY))) return { ok: false, error: "That is a lot of invites for one day. Please try again tomorrow." };

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

  // The text above always goes. Email is the admin's choice: an address typed only so the person can sign
  // in with it is not a request to email the invite too, so it needs the "Also email" box ticked.
  if (emailRaw && formData.get("alsoEmail") === "on") {
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
  return { ok: true };
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
export async function inviteBudgetLeader(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return { ok: false, error: "Only the Main Admin or an Admin can do this." };

  const name = String(formData.get("name") ?? "").trim();
  const phone = normalisePhone(String(formData.get("phone") ?? ""));
  const emailRaw = String(formData.get("email") ?? "").toLowerCase().trim();
  const departmentId = String(formData.get("departmentId") ?? "").trim();
  if (!name) return { ok: false, error: "Add their name." };
  if (phone.length < 10) return { ok: false, error: "Add a valid mobile number. The invite goes by text." };
  if (!departmentId) return { ok: false, error: "Choose their department." };

  const dept = await db.department.findFirst({ where: { id: departmentId, churchId: session.churchId }, select: { id: true, name: true } });
  if (!dept) return { ok: false, error: "That department was not found." };

  const email = emailRaw || `p${phone.replace(/\D/g, "")}@invite.worshiphq.app`;
  if (await db.user.findUnique({ where: { email } })) return { ok: false, error: "Someone already uses that email on WorshipHQ." };
  if (await db.user.findFirst({ where: { churchId: session.churchId, phone } })) return { ok: false, error: "Someone on your team already has that number." };

  // The plan's team size is enforced here, not just shown. Invites are also capped per day: each one is a text we pay for.
  if (!(await teamHasRoom(session.churchId))) return { ok: false, error: "Your plan's team is full. Upgrade in Billing to add more people." };
  const { rateLimit, DAY } = await import("@/lib/rate-limit");
  if (!(await rateLimit(`invite:${session.churchId}`, 30, DAY))) return { ok: false, error: "That is a lot of invites for one day. Please try again tomorrow." };

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
  return { ok: true };
}

/** Change a team member's role (Owner/Admin only). */
export async function changeUserRole(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return { ok: false, error: "Only the Main Admin or an Admin can do this." };

  const userId = String(formData.get("userId") ?? "").trim();
  const value = String(formData.get("role") ?? "").trim();
  if (!userId || !value) return { ok: false, error: "Pick a role." };

  // Can't change your own role
  if (userId === session.userId) return { ok: false, error: "You cannot change your own role." };
  const parsedRole = parseRoleValue(value);
  const role = parsedRole.role;
  const customRoleId = await ownedId("customRole", parsedRole.customRoleId, session.churchId);
  if (parsedRole.customRoleId && !customRoleId) return { ok: false, error: "That role no longer exists." };
  // The Main Admin role is only ever handed over with "Transfer Main Admin".
  if (role === "Owner") return { ok: false, error: "Use \"Hand over the Main Admin role\" for that." };
  const current = await db.user.findFirst({ where: { id: userId, churchId: session.churchId }, select: { role: true } });
  // Nobody changes the Main Admin's role, and only the Main Admin changes another Admin's role.
  if (!current) return { ok: false, error: "That person is not on your team." };
  if (current.role === "Owner") return { ok: false, error: "The Main Admin's role cannot be changed here." };
  if (current.role === "Admin" && session.role !== "Owner") return { ok: false, error: "Only the Main Admin can change another Admin's role." };

  const target = await db.user.findFirst({ where: { id: userId, churchId: session.churchId }, select: { name: true } });
  await db.user.updateMany({
    where: { id: userId, churchId: session.churchId },
    // A new role replaces a department-budget scope.
    data: { role, customRoleId, budgetDepartmentId: null },
  });

  await audit(session, "update", "user", `Changed ${target?.name ?? "a member"}'s role to ${role}`, userId);
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  return { ok: true };
}

/** Create a custom role with section access + delete permission (Owner/Admin). */
export async function createCustomRole(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return { ok: false, error: "Only the Main Admin or an Admin can do this." };
  // Custom roles are a Pro feature. assertCanWrite(session) with no module never consults the plan,
  // so this was open to every church including Free.
  assertPlanFeature(session, "custom-roles");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give the role a name." };
  if (BUILT_IN_ROLES.some((r) => r.toLowerCase() === name.toLowerCase()) || /^main admin$/i.test(name)) return { ok: false, error: "That name belongs to a built-in role. Choose another." };
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
  revalidatePath("/app/settings");
  return { ok: true };
}

export async function updateRolePermissions(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return { ok: false, error: "Only the Main Admin or an Admin can do this." };

  const role = String(formData.get("role") ?? "").trim();
  if (!role || !BUILT_IN_ROLES.includes(role as Role) || role === "Owner") return { ok: false, error: "That role cannot be edited." };
  // Only the Main Admin decides what Admins can do.
  if (role === "Admin" && session.role !== "Owner") return { ok: false, error: "Only the Main Admin can change what Admins can do." };

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

  await audit(session, "update", "role", `Changed what the ${role} role can use`);
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  return { ok: true };
}

/** Edit an existing custom role's name, sections and delete permission. */
export async function updateCustomRole(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return { ok: false, error: "Only the Main Admin or an Admin can do this." };
  assertPlanFeature(session, "custom-roles");

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { ok: false, error: "Give the role a name." };

  const role = await db.customRole.findFirst({
    where: { id, churchId: session.churchId },
    select: { id: true },
  });
  if (!role) return { ok: false, error: "That role was not found." };

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
  return { ok: true };
}

export async function deleteCustomRole(id: string): Promise<ActionResult> {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return { ok: false, error: "Only the Main Admin or an Admin can do this." };
  await moveToBin(session, "customRole", "CustomRole", id);
  // Detach any users on this role first (they fall back to their base role).
  await db.user.updateMany({ where: { customRoleId: id, churchId: session.churchId }, data: { customRoleId: null } });
  await db.customRole.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  return { ok: true };
}

/** Remove a team member (Owner/Admin only, can't remove yourself). */
export async function removeTeamMember(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return { ok: false, error: "Only the Main Admin or an Admin can do this." };

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { ok: false, error: "Nobody was chosen." };
  if (userId === session.userId) return { ok: false, error: "You cannot remove yourself." };

  // Nobody removes the Main Admin, and only the Main Admin removes another Admin.
  const target = await db.user.findFirst({ where: { id: userId, churchId: session.churchId } });
  if (!target) return { ok: false, error: "That person is not on your team." };
  if (target.role === "Owner") return { ok: false, error: "The Main Admin cannot be removed." };
  if (target.role === "Admin" && session.role !== "Owner") return { ok: false, error: "Only the Main Admin can remove an Admin." };

  await moveToBin(session, "teamMember", "User", userId);
  await db.user.delete({ where: { id: userId } });
  await audit(session, "delete", "user", `Removed ${target.name} from the team`, userId);
  revalidatePath("/app/settings");
  return { ok: true };
}


/** Make a team member a department budget leader: they then see only that department's budget, income and expenses. */
export async function setBudgetDepartment(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return { ok: false, error: "Only the Main Admin or an Admin can do this." };
  const userId = String(formData.get("userId") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "").trim();
  if (userId === session.userId) return { ok: false, error: "You cannot change your own role." };
  const [target, dept] = await Promise.all([
    db.user.findFirst({ where: { id: userId, churchId: session.churchId }, select: { name: true, role: true } }),
    db.department.findFirst({ where: { id: departmentId, churchId: session.churchId }, select: { id: true, name: true } }),
  ]);
  if (!target) return { ok: false, error: "That person is not on your team." };
  if (!dept) return { ok: false, error: "That department was not found." };
  if (target.role === "Owner") return { ok: false, error: "The Main Admin's role cannot be changed here." };
  if (target.role === "Admin" && session.role !== "Owner") return { ok: false, error: "Only the Main Admin can change another Admin's role." };
  await db.user.updateMany({ where: { id: userId, churchId: session.churchId }, data: { role: "Volunteer", customRoleId: null, budgetDepartmentId: dept.id } });
  await audit(session, "update", "user", `Made ${target.name} the ${dept.name} budget leader`, userId);
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  return { ok: true };
}

/** Send a fresh invite link to someone who has not accepted yet. The old link stops working. */
export async function resendTeamInvite(userId: string): Promise<ActionResult> {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return { ok: false, error: "Only the Main Admin or an Admin can do this." };
  const u = await db.user.findFirst({ where: { id: userId, churchId: session.churchId }, select: { id: true, name: true, phone: true, role: true, inviteAcceptedAt: true, passwordHash: true, budgetDepartment: { select: { name: true } }, customRole: { select: { name: true } } } });
  if (!u) return { ok: false, error: "That person is not on your team." };
  if (u.inviteAcceptedAt) return { ok: false, error: `${u.name} has already accepted.` };
  if (!u.phone) return { ok: false, error: "They have no phone number to text the invite to." };
  const { rateLimit, DAY } = await import("@/lib/rate-limit");
  if (!(await rateLimit(`invite:${session.churchId}`, 30, DAY))) return { ok: false, error: "That is a lot of invites for one day. Please try again tomorrow." };
  if (!(await rateLimit(`invite-resend:${u.id}`, 3, DAY))) return { ok: false, error: "This invite was already resent 3 times today." };

  const inviteToken = crypto.randomBytes(24).toString("base64url");
  await db.user.update({ where: { id: u.id }, data: { inviteToken } });
  const church = await db.church.findUnique({ where: { id: session.churchId }, select: { name: true } });
  const acceptUrl = `${await getBaseUrl()}/invite/${inviteToken}`;
  const as = u.budgetDepartment ? `${u.budgetDepartment.name} budget leader` : u.customRole?.name ?? u.role;
  const r = await sendSms(u.phone, `Reminder: you've been invited to join ${church?.name ?? "your church"} on WorshipHQ as ${as}. Accept & set up your account: ${acceptUrl}`, { heading: null });
  await audit(session, "update", "user", `Resent the team invite to ${u.name}`, u.id);
  revalidatePath("/app/settings");
  if (!r.ok && !r.stubbed) return { ok: false, error: r.error ?? "The text did not go. Check their number." };
  return { ok: true };
}
/**
 * The Main Admin hands the role to one of the church's Admins. The new Main Admin gets full control (billing, removing Admins),
 * and the person handing over becomes an Admin. The current password is asked for, because this cannot be done by someone
 * who only found a signed-in screen.
 */
export async function transferMainAdmin(input: { userId: string; password: string }): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const session = await requireSession();
  if (session.isDemo || session.impersonating) return { ok: false, error: "Not available here." };
  if (session.role !== "Owner") return { ok: false, error: "Only the Main Admin can hand over the role." };
  const { rateLimit, HOUR } = await import("@/lib/rate-limit");
  if (!(await rateLimit(`transfer-main-admin:${session.userId}`, 5, HOUR))) return { ok: false, error: "Too many tries. Please wait a while and try again." };

  const me = await db.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true, name: true } });
  if (!me?.passwordHash || !(await verifyPassword(String(input.password ?? ""), me.passwordHash))) return { ok: false, error: "Incorrect password." };

  const target = await db.user.findFirst({ where: { id: String(input.userId ?? ""), churchId: session.churchId }, select: { id: true, name: true, role: true, phone: true, email: true, passwordHash: true } });
  if (!target || target.id === session.userId) return { ok: false, error: "Choose one of your Admins." };
  if (target.role !== "Admin") return { ok: false, error: "The role can only be handed to an Admin. Make them an Admin first." };
  if (!target.passwordHash) return { ok: false, error: `${target.name} has not set up their login yet, so they cannot take over.` };

  await db.$transaction([
    db.user.update({ where: { id: target.id }, data: { role: "Owner", customRoleId: null } }),
    db.user.update({ where: { id: session.userId }, data: { role: "Admin", customRoleId: null } }),
  ]);
  await audit(session, "update", "user", `Handed the Main Admin role to ${target.name}`, target.id);

  // Tell both people, so nothing like this ever happens quietly.
  const church = await db.church.findUnique({ where: { id: session.churchId }, select: { name: true } });
  const churchName = church?.name ?? "your church";
  try {
    if (target.phone) await sendSms(target.phone, `${me.name} has made you the Main Admin of ${churchName} on WorshipHQ. You now have full control, including billing.`, { heading: null });
    if (target.email && !target.email.endsWith("@invite.worshiphq.app")) {
      await sendEmail({
        to: target.email,
        subject: `You are now the Main Admin of ${churchName}`,
        html: `<p>${escapeHtml(me.name)} has made you the <strong>Main Admin</strong> of ${escapeHtml(churchName)} on WorshipHQ.</p><p>You now have full control of the church account, including billing and removing Admins.</p>`,
        log: { churchId: session.churchId, name: `Main Admin handed over to ${target.name}`, segment: "account" },
      });
    }
  } catch (e) {
    console.error("[transfer main admin notify]", (e as Error).message);
  }
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  return { ok: true, name: target.name };
}

/** Undo a scheduled downgrade before it takes effect. */
export async function cancelScheduledChange() {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner") return { error: "Only the Main Admin can change plans" };

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
  const { loadPlanChange } = await import("@/lib/billing/context");
  const c = await loadPlanChange(session.churchId, plan, interval);
  // A church in Ghana sees cedis, worked out exactly as the charge will be (see lib/billing/local-price).
  const { chargeRate, churchIsGhana } = await import("@/lib/billing/local-price");
  const ghana = await churchIsGhana(session.churchId);
  const r = ghana ? chargeRate(c.platformConfig, plan, c.interval, true) : 1;
  const show = (usd: number) => (ghana ? Math.round(usd * r) : usd);
  return {
    direction: c.preview.direction,
    amountDueUsd: show(c.preview.amountDueUsd),
    listPrice: show(c.listPrice),
    // The interval the change is really priced on. An upgrade inside a paid period keeps the one the church is on.
    interval: c.interval,
    daysLeft: c.preview.daysLeft,
    unusedCreditUsd: show(c.preview.unusedCreditUsd),
    effectiveDate: c.preview.effectiveDate.toISOString(),
    renewsAt: c.preview.renewsAt ? c.preview.renewsAt.toISOString() : null,
    summary: ghana ? c.preview.summary.replace(/\$\s?([\d,]+(?:\.\d+)?)/g, (_m, n: string) => `GHS ${Math.round(Number(n.replace(/,/g, "")) * r).toLocaleString()}`) : c.preview.summary,
    symbol: ghana ? "GHS " : c.platformConfig.currencySymbol,
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

  const { chargeRate, churchIsGhana } = await import("@/lib/billing/local-price");
  if (await churchIsGhana(session.churchId)) {
    const r = chargeRate(platformConfig, plan, interval, true);
    const list = Math.round(listAmount * r);
    const now = Math.round(check.newAmount! * r);
    return { ok: true as const, label: check.label!, listAmount: list, newAmount: now, saved: list - now, symbol: "GHS " };
  }
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
  requestedInterval: "monthly" | "yearly",
  couponCode?: string,
  /** The church ticked "keep my card and renew automatically" (card payments only; see activatePlanPayment). */
  saveCard?: boolean,
) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner") return { error: "Only the Main Admin can change plans" };

  const validPlans = ["free", "starter", "pro", "max"];
  if (!validPlans.includes(plan)) return { error: "Invalid plan" };

  // One calculation prices the plan change, shared with the preview the church just looked at, so what it
  // is charged is exactly what it was shown.
  const { loadPlanChange } = await import("@/lib/billing/context");
  const ctx = await loadPlanChange(session.churchId, plan, requestedInterval);
  const { sub: existing, platformConfig, planConfig: targetConfig, interval, listPrice: targetList, preview } = ctx;
  if (existing?.status === "grace") return { error: "Your plan cannot be changed (Gift of Grace)" };

  if (preview.direction === "same") return { error: preview.summary || "You're already on this plan." };

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
  const isRenewal = preview.direction === "renew";

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

  // Prices are kept in USD; Paystack charges cedis. A church in Ghana pays the fixed cedi price the
  // SuperAdmin set (prorations and coupons in proportion); everyone else pays the dollar price converted.
  const { chargeRate, churchIsGhana } = await import("@/lib/billing/local-price");
  const rate = chargeRate(platformConfig, plan, interval, await churchIsGhana(session.churchId));
  const chargeAmountGhs = Math.round(amount * rate);

  // A 100%-off coupon means nothing to charge - activate straight away.
  if (couponId && chargeAmountGhs <= 0) {
    const { redeemCoupon } = await import("@/lib/billing/coupons");
    if (!(await redeemCoupon(couponId, session.churchId))) {
      return { error: "This coupon has already been used." };
    }
    // The period comes from the same calculation as the price: a renewal carries on from the old end, an
    // upgrade keeps the renewal date, and a new purchase starts today. (This used to start a fresh month
    // from today for all three.)
    const periodStart = isRenewal ? preview.effectiveDate : isProratedUpgrade ? (existing?.periodStart ?? new Date()) : new Date();
    const renewsAt = preview.renewsAt ?? new Date();
    await db.subscription.upsert({
      where: { churchId: session.churchId },
      create: { churchId: session.churchId, plan, interval, status: "active", renewsAt, periodStart },
      update: { plan, interval, status: "active", renewsAt, periodStart, renewalRemindersSent: { set: [] }, renewalFailures: 0, scheduledPlan: null, cancelAtPeriodEnd: false },
    });
    // Zero-value payment, but still a ledger entry so billing history is complete.
    const { recordPlanPayment } = await import("@/lib/billing/payments");
    await recordPlanPayment({
      churchId: session.churchId,
      reference: `COUPON-${couponId}-${Date.now()}`,
      plan, interval,
      amountUsd: 0, amountGhs: 0,
      usdToGhsRate: rate,
      couponId, discountUsd: listAmount,
      kind: isRenewal ? "renewal" : isProratedUpgrade ? "upgrade" : "new",
      periodStart, periodEnd: renewsAt,
    });
    await sendUpgradeReceipt(session.churchId, planConfig.name, "Free (100% coupon)", interval, `COUPON-${Date.now()}`, {
      amountGhs: 0, discountGhs: Math.round(listAmount * rate), from: periodStart, to: renewsAt, method: "Coupon",
    });
    revalidatePath("/app/settings");
    revalidatePath("/app", "layout");
    return { ok: true as const, plan };
  }
  const reference = newPaymentReference();
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const returnUrl = `${appUrl}/app/settings?upgraded=${plan}&ref=${reference}&interval=${interval}`;

  // When the SuperAdmin switch points at Hubtel, take the subscription payment through Hubtel instead of
  // Paystack. We remember the plan details in a PaymentIntent so the Hubtel callback can activate the plan.
  if ((await getCollectionProvider()) === "hubtel") {
    const cfg = hubtelConfig();
    if (cfg) {
      await db.paymentIntent.create({
        data: {
          clientReference: reference,
          provider: "hubtel",
          kind: "plan_upgrade",
          churchId: session.churchId,
          amountGhs: chargeAmountGhs,
          data: { plan, interval, amountUsd: amount, listAmountUsd: listAmount, couponId, prorated: isProratedUpgrade, renewal: isRenewal, usdToGhsRate: rate },
        },
      });
      const r = await initHubtelCheckout(cfg, {
        amountGhs: chargeAmountGhs,
        description: `WorshipHQ ${plan} ${interval} plan`,
        clientReference: reference,
        callbackUrl: `${appUrl}/api/webhooks/hubtel`,
        returnUrl,
        cancellationUrl: returnUrl,
        payeeEmail: session.email ?? undefined,
      });
      if (!r.ok) {
        await db.paymentIntent.update({ where: { clientReference: reference }, data: { status: "failed" } }).catch(() => {});
        return { error: r.error ?? "Could not start the Hubtel payment. Please try again." };
      }
      // The client redirects to Hubtel's hosted checkout; the callback activates the plan after payment.
      return { ok: true as const, plan, payment: { ok: true as const, stubbed: false, reference, authorizationUrl: r.checkoutUrl }, couponId };
    }
  }

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
      usdToGhsRate: rate,
      prorated: isProratedUpgrade,
      renewal: isRenewal,
      // Sealed with the rest, so it cannot be switched on from outside. Honoured only for a real card payment.
      saveCard: !!saveCard,
    },
  });

  if (init.stubbed) {
    if (couponId) {
      const { redeemCoupon } = await import("@/lib/billing/coupons");
      await redeemCoupon(couponId, session.churchId);
    }
    // Same rule as the live path: an upgrade keeps the renewal date, a renewal carries on from the old end.
    const periodStart = isRenewal ? preview.effectiveDate : isProratedUpgrade ? (existing?.periodStart ?? new Date()) : new Date();
    const renewsAt = preview.renewsAt ?? new Date();
    await db.subscription.upsert({
      where: { churchId: session.churchId },
      create: { churchId: session.churchId, plan, interval, status: "active", renewsAt, periodStart },
      update: { plan, interval, status: "active", renewsAt, periodStart, renewalRemindersSent: { set: [] }, renewalFailures: 0, scheduledPlan: null, cancelAtPeriodEnd: false },
    });
    const { recordPlanPayment } = await import("@/lib/billing/payments");
    await recordPlanPayment({
      churchId: session.churchId,
      reference, plan, interval,
      amountUsd: amount, amountGhs: chargeAmountGhs,
      usdToGhsRate: rate,
      couponId, discountUsd: listAmount - amount,
      kind: isRenewal ? "renewal" : isProratedUpgrade ? "upgrade" : "new",
      periodStart, periodEnd: renewsAt,
      source: "paystack",
    });
    const sym = platformConfig.currencySymbol;
    await sendUpgradeReceipt(session.churchId, planConfig.name, `${sym}${amount.toLocaleString()} (₵${chargeAmountGhs.toLocaleString()})`, interval, reference, {
      amountGhs: chargeAmountGhs, discountGhs: Math.max(0, Math.round((listAmount - amount) * rate)), from: periodStart, to: renewsAt, prorated: isProratedUpgrade,
    });
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
  // The code goes to the Main Admin's phone and unlocks a year of a paid plan, so only the Main Admin
  // may use it. Before this, any team member of the church who had seen or guessed it could.
  if (session.role !== "Owner") return { error: "Only the Main Admin can use an upgrade code." };

  // A six-digit code is only 900,000 guesses, so guessing has to be slow: five tries an hour per
  // church, and a wider cap per address so one person cannot rotate through churches.
  const { rateLimitAll, clientIp, HOUR } = await import("@/lib/rate-limit");
  const allowed = await rateLimitAll([
    { key: `bypass:church:${session.churchId}`, max: 5, windowMs: HOUR },
    { key: `bypass:ip:${await clientIp()}`, max: 15, windowMs: HOUR },
  ]);
  if (!allowed) return { error: "Too many attempts. Please wait an hour and try again." };

  const sub = await db.subscription.findUnique({ where: { churchId: session.churchId } });
  if (!sub || !sub.bypassPlan || !sub.bypassCode) {
    return { error: "No upgrade code found for your account" };
  }
  const { safeEqual } = await import("@/lib/auth/tokens");
  if (!safeEqual(sub.bypassCode, code.trim())) {
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
  await sendUpgradeReceipt(session.churchId, planConfig?.name ?? sub.bypassPlan, "Free (SuperAdmin gift)", "yearly", `BYPASS-${Date.now()}`, {
    amountGhs: 0, kind: "gift", from: new Date(), to: renewsAt,
  });

  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  return { ok: true, plan: sub.bypassPlan };
}
