"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, hashPassword, verifyPassword } from "@/lib/auth";
import { getFormDefinition, getVisitorFormDefinition } from "@/lib/forms/registration";
import { sendSms } from "@/lib/integrations/sms";
import { sendOtp, verifyOtp } from "@/lib/auth/otp";
import { initializePayment, newPaymentReference } from "@/lib/integrations/paystack";
import { env } from "@/lib/env";
import type { Role } from "@prisma/client";
import { sendEmail } from "@/lib/integrations/email";

/** Update the signed-in user's own name, email and profile photo. */
export async function updateProfile(formData: FormData) {
  const session = await requireSession();
  // Demo and impersonation sessions aren't backed by a real user row.
  if (session.isDemo || session.impersonating) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const data: { name: string; email?: string; photoUrl?: string | null } = { name };

  // Allow changing email only if it isn't taken by someone else.
  if (email && email !== session.email) {
    const taken = await db.user.findUnique({ where: { email } });
    if (!taken) data.email = email;
  }

  // Profile photo (data URL or empty to clear).
  if (formData.has("photoUrl")) {
    const photo = String(formData.get("photoUrl") ?? "");
    if (!photo) data.photoUrl = null;
    else if (photo.startsWith("data:image/") && photo.length < 1_500_000) data.photoUrl = photo;
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
  if (next.length < 6) return { ok: false, error: "New password must be at least 6 characters." };

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await verifyPassword(current, user.passwordHash))) {
    return { ok: false, error: "Your current password is incorrect." };
  }

  await db.user.update({ where: { id: session.userId }, data: { passwordHash: await hashPassword(next) } });
  return { ok: true };
}

export async function sendPasswordResetOtp() {
  const session = await requireSession();
  if (session.isDemo || session.impersonating) return { ok: false, error: "Not available." };

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { phone: true, phoneVerified: true } });
  if (!user?.phone || !user.phoneVerified) return { ok: false, error: "No verified phone on this account." };

  const result = await sendOtp({ phone: user.phone, purpose: "reset-password", userId: session.userId });
  if (!result.ok) return { ok: false, error: "Couldn't send SMS." };
  return { ok: true, verificationId: result.verificationId };
}

export async function resetPasswordWithOtp(formData: FormData) {
  const session = await requireSession();
  if (session.isDemo || session.impersonating) return { ok: false, error: "Not available." };

  const vid = String(formData.get("verificationId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const next = String(formData.get("next") ?? "");
  if (next.length < 6) return { ok: false, error: "Password must be at least 6 characters." };

  const result = await verifyOtp(vid, code);
  if (!result.ok) return { ok: false, error: result.error ?? "Invalid code." };

  await db.user.update({ where: { id: session.userId }, data: { passwordHash: await hashPassword(next) } });
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

  const taken = await db.user.findFirst({ where: { phone: newPhone, id: { not: session.userId } } });
  if (taken) return { ok: false, error: "This phone number is already in use." };

  const result = await sendOtp({ phone: newPhone, purpose: "verify-phone", userId: session.userId });
  if (!result.ok) return { ok: false, error: "Couldn't send verification SMS." };
  return { ok: true, verificationId: result.verificationId };
}

export async function confirmPhoneChange(formData: FormData) {
  const session = await requireSession();
  if (session.isDemo || session.impersonating) return { ok: false, error: "Not available." };

  const vid = String(formData.get("verificationId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const newPhone = String(formData.get("newPhone") ?? "").trim();

  const result = await verifyOtp(vid, code);
  if (!result.ok) return { ok: false, error: result.error ?? "Invalid code." };

  await db.user.update({
    where: { id: session.userId },
    data: { phone: newPhone, phoneVerified: true },
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

  const result = await sendOtp({ phone: newEmail, purpose: "verify-email", userId: session.userId });
  if (!result.ok) return { ok: false, error: "Couldn't send verification email." };
  return { ok: true, verificationId: result.verificationId };
}

export async function confirmEmailChange(formData: FormData) {
  const session = await requireSession();
  if (session.isDemo || session.impersonating) return { ok: false, error: "Not available." };

  const vid = String(formData.get("verificationId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const newEmail = String(formData.get("newEmail") ?? "").toLowerCase().trim();

  const result = await verifyOtp(vid, code);
  if (!result.ok) return { ok: false, error: result.error ?? "Invalid code." };

  await db.user.update({
    where: { id: session.userId },
    data: { email: newEmail },
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
      // logoUrl is managed in the Branding tab (updateBranding), not here.
    },
  });

  revalidatePath("/app/settings");
  revalidatePath("/app");
}
export async function requestSenderId(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const senderId = String(formData.get("senderId") ?? "").trim();

  if (!senderId) return;

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
    else if (logoRaw.startsWith("data:image/") && logoRaw.length < 1_500_000) data.logoUrl = logoRaw;
  }

  await db.church.update({ where: { id: session.churchId }, data });
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
}

/** Save the full registration form definition (from the form builder). */
export async function saveRegistrationForm(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  const raw = String(formData.get("definition") ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  // Normalise through getFormDefinition so we only ever store valid fields.
  const fields = getFormDefinition(parsed);

  await db.church.update({
    where: { id: session.churchId },
    data: { registrationFields: fields as object },
  });

  revalidatePath("/app/settings");
  revalidatePath("/join", "layout");
}

export async function saveVisitorForm(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  const raw = String(formData.get("definition") ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const fields = getVisitorFormDefinition(parsed);

  await db.church.update({
    where: { id: session.churchId },
    data: { visitorFormFields: fields as object },
  });

  revalidatePath("/app/settings");
  revalidatePath("/visit", "layout");
}

export async function saveChildrenForm(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  const raw = String(formData.get("definition") ?? "[]");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return; }

  const { getChildrenFormDefinition } = await import("@/lib/forms/registration");
  const fields = getChildrenFormDefinition(parsed);

  await db.church.update({
    where: { id: session.churchId },
    data: { childrenFormFields: fields as object },
  });

  revalidatePath("/app/settings");
  revalidatePath("/children", "layout");
}

export async function saveTeensForm(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  const raw = String(formData.get("definition") ?? "[]");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return; }

  const { getTeensFormDefinition } = await import("@/lib/forms/registration");
  const fields = getTeensFormDefinition(parsed);

  await db.church.update({
    where: { id: session.churchId },
    data: { teensFormFields: fields as object },
  });

  revalidatePath("/app/settings");
  revalidatePath("/teens", "layout");
}

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

/** Invite a teammate — creates a User in this church with a temporary password. */
export async function inviteTeammate(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const name = String(formData.get("name") ?? "").trim();
  const { role, customRoleId } = parseRoleValue(String(formData.get("role") ?? "Volunteer"));
  if (!email || !name) return;

  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return;

  const tempPassword = String(formData.get("password") ?? "").trim() || "changeme123";
  await db.user.create({
    data: {
      churchId: session.churchId,
      email,
      name,
      role,
      customRoleId,
      passwordHash: await hashPassword(tempPassword),
    },
  });
  const church = await db.church.findUnique({
    where: { id: session.churchId },
    select: { name: true },
  });

  const emailResult = await sendEmail({
    to: email,
    subject: `You've been invited to ${church?.name ?? "WorshipHQ"}`,
    html: `
    <h2>Welcome to ${church?.name ?? "WorshipHQ"}</h2>

    <p>You have been added as a team member.</p>

    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Temporary Password:</strong> ${tempPassword}</p>

    <p>Please sign in and change your password immediately.</p>

    <p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://worshiphq.app"}/sign-in">
        Login to WorshipHQ
      </a>
    </p>
  `,
  });

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
  const { role, customRoleId } = parseRoleValue(value);
  // Only Owner can make someone else Owner
  if (role === "Owner" && session.role !== "Owner") return;

  await db.user.updateMany({
    where: { id: userId, churchId: session.churchId },
    data: { role, customRoleId },
  });

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
  // A section can only be managed if it's also viewable — keep them consistent.
  const manageSections = formData.getAll("manageSections").map(String).filter((s) => sections.includes(s));
  const canDelete = formData.get("canDelete") === "on" || formData.get("canDelete") === "yes";

  await db.customRole.upsert({
    where: { churchId_name: { churchId: session.churchId, name } },
    create: { churchId: session.churchId, name, sections, manageSections, canDelete },
    update: { sections, manageSections, canDelete },
  });

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

export async function deleteCustomRole(id: string) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;
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

  await db.user.delete({ where: { id: userId } });
  revalidatePath("/app/settings");
}

async function sendUpgradeReceipt(churchId: string, planName: string, amount: string, interval: string, reference: string) {
  const admin = await db.user.findFirst({
    where: { churchId, role: "Owner" },
    select: { email: true, phone: true, name: true },
  });
  const church = await db.church.findUnique({ where: { id: churchId }, select: { name: true } });
  if (!admin) return;

  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  if (admin.email) {
    await sendEmail({
      to: admin.email,
      subject: `WorshipHQ — Upgraded to ${planName}!`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
          <h2 style="color:#0d7377">🚀 You're on the ${planName} plan!</h2>
          <p>Hi ${admin.name ?? "there"},</p>
          <p>Your church <strong>${church?.name ?? ""}</strong> has been upgraded to the <strong>${planName}</strong> plan. All new features are now unlocked.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#666">Plan</td><td style="padding:8px 0;font-weight:600">${planName}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Amount</td><td style="padding:8px 0;font-weight:600">${amount}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Billing</td><td style="padding:8px 0">${interval === "yearly" ? "Yearly" : "Monthly"}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Date</td><td style="padding:8px 0">${date}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Reference</td><td style="padding:8px 0;font-family:monospace;font-size:13px">${reference}</td></tr>
          </table>
          <p style="margin-top:24px"><a href="${appUrl}/app/settings?tab=billing" style="background:#0d7377;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600">View your plan</a></p>
          <p style="margin-top:32px;color:#999;font-size:12px">This is your payment receipt. Keep it for your records.</p>
        </div>`,
    });
  }

  if (admin.phone) {
    await sendSms(
      admin.phone,
      `✅ ${church?.name ?? "Your church"} has been upgraded to the ${planName} plan! Amount: ${amount} (${interval}). Ref: ${reference}. Log in to see your new features.`,
      { heading: null },
    );
  }
}

export async function changePlan(plan: string, interval: "monthly" | "yearly") {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner") return { error: "Only the church owner can change plans" };

  const validPlans = ["free", "starter", "pro", "max"];
  if (!validPlans.includes(plan)) return { error: "Invalid plan" };

  const existing = await db.subscription.findUnique({ where: { churchId: session.churchId } });
  if (existing?.status === "grace") return { error: "Your plan cannot be changed (Gift of Grace)" };

  if (plan === "free") {
    await db.subscription.upsert({
      where: { churchId: session.churchId },
      create: { churchId: session.churchId, plan: "free", interval: "monthly", status: "active" },
      update: { plan: "free", interval: "monthly", status: "active", renewsAt: null, paystackCustomerCode: null },
    });
    revalidatePath("/app/settings");
    return { ok: true };
  }

  const { plans } = await import("@/config/pricing");
  const planConfig = plans.find((p) => p.id === plan);
  if (!planConfig) return { error: "Invalid plan" };

  const { getPlatformConfig } = await import("@/lib/data/platform-config");
  const platformConfig = await getPlatformConfig();
  const dbPrice = platformConfig.prices[plan];
  const amount = interval === "yearly" ? (dbPrice?.yearly ?? planConfig.yearly) : (dbPrice?.monthly ?? planConfig.monthly);
  // Prices are displayed in USD; Paystack (Ghana) charges the GHS equivalent.
  const chargeAmountGhs = Math.round(amount * platformConfig.usdToGhsRate);
  const reference = newPaymentReference();
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const returnUrl = `${appUrl}/app/settings?upgraded=${plan}&ref=${reference}&interval=${interval}`;

  const init = await initializePayment({
    email: session.email || `billing+${session.churchId}@worshiphq.org`,
    amount: chargeAmountGhs,
    currency: "GHS",
    reference,
    callbackUrl: returnUrl,
    stubReturnUrl: returnUrl,
    metadata: {
      kind: "plan_upgrade",
      churchId: session.churchId,
      plan,
      interval,
      displayAmountUsd: amount,
      usdToGhsRate: platformConfig.usdToGhsRate,
    },
  });

  if (init.stubbed) {
    const renewsAt = new Date();
    renewsAt.setMonth(renewsAt.getMonth() + (interval === "yearly" ? 12 : 1));
    await db.subscription.upsert({
      where: { churchId: session.churchId },
      create: { churchId: session.churchId, plan, interval, status: "active", renewsAt },
      update: { plan, interval, status: "active", renewsAt },
    });
    const sym = platformConfig.currencySymbol;
    await sendUpgradeReceipt(session.churchId, planConfig.name, `${sym}${amount.toLocaleString()} (₵${chargeAmountGhs.toLocaleString()})`, interval, reference);
    revalidatePath("/app/settings");
    revalidatePath("/app", "layout");
    return { ok: true, plan };
  }

  if (init.ok && init.authorizationUrl) redirect(init.authorizationUrl);
  return { error: init.error ?? "Could not start payment. Please try again." };
}

export async function verifyPlanUpgrade(reference: string, plan: string, interval: string) {
  const session = await requireSession();

  const validPlans = ["starter", "pro", "max"];
  if (!validPlans.includes(plan)) return { error: "Invalid plan" };

  const sub = await db.subscription.findUnique({ where: { churchId: session.churchId } });
  if (sub?.plan === plan && sub?.status === "active") {
    return { ok: true, alreadyActive: true };
  }

  if (env.PAYSTACK_SECRET_KEY) {
    try {
      const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
      });
      const data = await res.json();
      if (!data?.data || data.data.status !== "success") {
        return { error: "Payment not confirmed yet. Please wait a moment and refresh." };
      }
    } catch {
      return { error: "Could not verify payment. Please refresh the page." };
    }
  }

  const billingInterval = interval === "yearly" ? "yearly" : "monthly";
  const renewsAt = new Date();
  renewsAt.setMonth(renewsAt.getMonth() + (billingInterval === "yearly" ? 12 : 1));

  await db.subscription.upsert({
    where: { churchId: session.churchId },
    create: { churchId: session.churchId, plan, interval: billingInterval, status: "active", renewsAt },
    update: { plan, interval: billingInterval, status: "active", renewsAt },
  });

  const { plans } = await import("@/config/pricing");
  const planConfig = plans.find((p) => p.id === plan);
  const { getPlatformConfig } = await import("@/lib/data/platform-config");
  const platformConfig = await getPlatformConfig();
  const sym = platformConfig.currencySymbol;
  const dbPrice = platformConfig.prices[plan];
  const amount = billingInterval === "yearly" ? (dbPrice?.yearly ?? planConfig?.yearly ?? 0) : (dbPrice?.monthly ?? planConfig?.monthly ?? 0);
  const chargedGhs = Math.round(amount * platformConfig.usdToGhsRate);
  await sendUpgradeReceipt(session.churchId, planConfig?.name ?? plan, `${sym}${amount.toLocaleString()} (₵${chargedGhs.toLocaleString()})`, billingInterval, reference);

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

  const { plans } = await import("@/config/pricing");
  const planConfig = plans.find((p) => p.id === sub.bypassPlan);
  await sendUpgradeReceipt(session.churchId, planConfig?.name ?? sub.bypassPlan, "Free (SuperAdmin gift)", "yearly", `BYPASS-${Date.now()}`);

  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  return { ok: true, plan: sub.bypassPlan };
}
