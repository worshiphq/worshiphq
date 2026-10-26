"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  startGhostSession,
  stopGhostSession,
  clearSession,
  requireSuperAdmin,
} from "@/lib/auth";
import { saveMarketingContent, type MarketingContent } from "@/lib/data/site-content";
import { sendSms } from "@/lib/integrations/sms";
import { addCredits } from "@/lib/sms/credits";
import { isSmsTier } from "@/config/sms";
import { createSubaccount, updateSubaccount, listBanks, resolveAccount } from "@/lib/integrations/paystack";
import { env } from "@/lib/env";
import { notifyPaymentRequest, type PaymentRequestEvent } from "@/lib/giving/notify";
import { saveGivingSettings } from "@/lib/giving/settings";
import { isFeeMode } from "@/lib/giving/fees";

/**
 * Manually run all scheduled automations now (platform owner only). Useful to
 * verify sends without waiting for the daily cron. Fires every timezone-gated
 * task regardless of the hour (same as the daily batch).
 */
export async function runAutomationsNow() {
  await requireSuperAdmin();
  const { runDailyAutomations } = await import("@/lib/automations/dispatch");
  const summary = await runDailyAutomations(new Date(), false);
  return { ok: true as const, summary };
}

// ── Auth (signing in lives in admin-auth.ts) ──
export async function superAdminSignOut() {
  await clearSession();
  redirect("/admin/login");
}

// ── Impersonation ──
// Emergency entry (no code from the church). A reason is required and the entry
// is recorded; the normal route is requestSupportAccess in support-access.ts.
const EMERGENCY_HOURS = 4;

export async function impersonateChurch(churchId: string, formData?: FormData) {
  await requireSuperAdmin();
  const reason = String(formData?.get("reason") ?? "").trim().slice(0, 300);
  if (!reason) return;
  const church = await db.church.findUnique({ where: { id: churchId }, select: { id: true } });
  if (!church) return;
  const until = new Date(Date.now() + EMERGENCY_HOURS * 60 * 60_000);
  const rec = await db.supportAccess.create({
    data: { churchId: church.id, method: "emergency", reason, status: "active", startedAt: new Date(), until },
  });
  await startGhostSession(church.id, { until: until.getTime(), rid: rec.id });
  redirect("/app");
}

/** Called from the app shell banner to return to the admin area. */
export async function exitImpersonation() {
  const sa = await requireSuperAdmin();
  if (sa.rid) {
    await db.supportAccess.updateMany({
      where: { id: sa.rid, status: "active" },
      data: { status: "ended", endedAt: new Date() },
    });
  }
  await stopGhostSession();
  redirect("/admin");
}

// ── Church management ──
export async function setChurchSuspended(churchId: string, suspended: boolean) {
  await requireSuperAdmin();
  await db.church.update({ where: { id: churchId }, data: { suspended } });
  revalidatePath("/admin");
}

export async function approveSenderId(churchId: string) {
  await requireSuperAdmin();

  const church = await db.church.update({
    where: { id: churchId },
    data: {
      smsSenderIdStatus: "approved",
    },
    select: {
      name: true,
      smsSenderId: true,
    },
  });

  const owner = await db.user.findFirst({
    where: {
      churchId,
      phoneVerified: true,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      phone: true,
    },
  });

  console.log("OWNER PHONE:", owner?.phone);

  if (owner?.phone) {
    await sendSms(
      owner.phone,
      `Congratulations!

Your Sender ID "${church.smsSenderId}" has been approved.

You can now use it for SMS broadcasts in WorshipHQ.`,
      { heading: null }
    );
  }

  revalidatePath("/admin");
}

export async function rejectSenderId(churchId: string) {
  await requireSuperAdmin();

  const church = await db.church.update({
    where: { id: churchId },
    data: {
      smsSenderIdStatus: "rejected",
    },
    select: {
      smsSenderId: true,
    },
  });

  const owner = await db.user.findFirst({
    where: {
      churchId,
      phoneVerified: true,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      phone: true,
    },
  });

  if (owner?.phone) {
    await sendSms(
      owner.phone,
      `Your Sender ID "${church.smsSenderId}" was not approved.

Please contact WorshipHQ for assistance.

Email: worshiphqapp@gmail.com
Phone: +233247258161`,
      { heading: null }
    );
  }

  revalidatePath("/admin");
}

export async function setChurchPlan(churchId: string, plan: string) {
  await requireSuperAdmin();
  await db.subscription.upsert({
    where: { churchId },
    create: { churchId, plan },
    update: { plan },
  });
  revalidatePath("/admin");
}

export async function grantPlanBypass(churchId: string, plan: string) {
  await requireSuperAdmin();
  const validPlans = ["starter", "pro", "max"];
  if (!validPlans.includes(plan)) return { error: "Invalid plan" };

  const church = await db.church.findUnique({
    where: { id: churchId },
    select: { name: true, id: true },
  });
  if (!church) return { error: "Church not found" };

  const owner = await db.user.findFirst({
    where: { churchId, role: "Owner" },
    select: { phone: true, name: true },
  });

  const code = String(Math.floor(100000 + Math.random() * 900000));

  await db.subscription.upsert({
    where: { churchId },
    create: { churchId, plan: "free", bypassPlan: plan, bypassCode: code },
    update: { bypassPlan: plan, bypassCode: code },
  });

  if (owner?.phone) {
    const planNames: Record<string, string> = { starter: "Starter", pro: "Pro", max: "Max" };
    await sendSms(
      owner.phone,
      `You've been granted a free upgrade to the ${planNames[plan]} plan! Go to Settings → Billing and enter code: ${code} to activate.`,
      { heading: null },
    );
  }

  revalidatePath("/admin");
  return { ok: true, code, phone: owner?.phone ?? null };
}

export async function grantSmsCredits(churchId: string, credits: number) {
  await requireSuperAdmin();
  if (!credits || !Number.isFinite(credits)) return;
  await addCredits(churchId, Math.round(credits), "bonus", { note: "Granted by WorshipHQ" });
  revalidatePath("/admin");
}

export async function deleteChurch(churchId: string) {
  await requireSuperAdmin();
  const church = await db.church.findUnique({ where: { id: churchId }, select: { isDemo: true } });
  if (!church || church.isDemo) return; // never delete the demo church
  await db.church.delete({ where: { id: churchId } });
  revalidatePath("/admin");
}

// ── Platform pricing ──
export async function updatePlatformPricing(
  currency: string,
  currencySymbol: string,
  planPrices: Record<string, { monthly: number; yearly: number }>,
  usdToGhsRate?: number,
) {
  await requireSuperAdmin();
  const rate = usdToGhsRate && usdToGhsRate > 0 ? usdToGhsRate : undefined;
  await db.platformConfig.upsert({
    where: { id: "default" },
    update: { currency, currencySymbol, planPrices: planPrices as object, ...(rate ? { usdToGhsRate: rate } : {}) },
    create: { id: "default", currency, currencySymbol, planPrices: planPrices as object, usdToGhsRate: rate ?? 12.0 },
  });
  revalidatePath("/admin/pricing");
  revalidatePath("/app/settings");
  revalidatePath("/", "layout");
}

/**
 * Save the full plan definitions - names, taglines, limits, marketing bullets
 * AND which features each plan unlocks. Prices are written alongside so one
 * save updates the marketing site, sign-up, billing and feature gating together.
 */
export async function updatePlanDefinitions(input: {
  currency: string;
  currencySymbol: string;
  usdToGhsRate?: number;
  plans: Array<{
    id: string;
    name: string;
    tagline: string;
    monthly: number;
    yearly: number;
    membersLabel: string;
    memberLimit: number;
    teamUsers: number;
    featured: boolean;
    cta: string;
    marketingFeatures: string[];
    features: string[];
  }>;
}) {
  await requireSuperAdmin();

  const VALID = ["free", "starter", "pro", "max"];
  const planDefs: Record<string, unknown> = {};
  const planPrices: Record<string, { monthly: number; yearly: number }> = {};

  for (const p of input.plans) {
    if (!VALID.includes(p.id)) continue;
    const monthly = Math.max(0, Number(p.monthly) || 0);
    const yearly = Math.max(0, Number(p.yearly) || 0);
    planPrices[p.id] = { monthly, yearly };
    planDefs[p.id] = {
      name: String(p.name || p.id).slice(0, 40),
      tagline: String(p.tagline || "").slice(0, 120),
      membersLabel: String(p.membersLabel || "").slice(0, 60),
      // -1 means unlimited
      memberLimit: Number.isFinite(Number(p.memberLimit)) ? Number(p.memberLimit) : -1,
      teamUsers: Number.isFinite(Number(p.teamUsers)) ? Number(p.teamUsers) : -1,
      featured: Boolean(p.featured),
      cta: String(p.cta || "Choose plan").slice(0, 40),
      marketingFeatures: (p.marketingFeatures ?? [])
        .map((f) => String(f).trim()).filter(Boolean).slice(0, 20),
      features: [...new Set((p.features ?? []).map((f) => String(f).trim()).filter(Boolean))],
    };
  }

  if (Object.keys(planDefs).length === 0) {
    return { ok: false as const, error: "No valid plans supplied." };
  }

  const rate = input.usdToGhsRate && input.usdToGhsRate > 0 ? input.usdToGhsRate : undefined;
  await db.platformConfig.upsert({
    where: { id: "default" },
    update: {
      currency: input.currency,
      currencySymbol: input.currencySymbol,
      planPrices: planPrices as object,
      planDefs: planDefs as object,
      ...(rate ? { usdToGhsRate: rate } : {}),
    },
    create: {
      id: "default",
      currency: input.currency,
      currencySymbol: input.currencySymbol,
      planPrices: planPrices as object,
      planDefs: planDefs as object,
      usdToGhsRate: rate ?? 12.0,
    },
  });

  // Everything that reads plans: marketing, sign-up, the app shell and settings.
  revalidatePath("/admin/pricing");
  revalidatePath("/pricing");
  revalidatePath("/sign-up");
  revalidatePath("/app/settings");
  revalidatePath("/", "layout");
  return { ok: true as const };
}

// ── Marketing content ──
export async function saveMarketing(formData: FormData) {
  await requireSuperAdmin();
  const heroSubhead = String(formData.get("heroSubhead") ?? "").trim();

  // Testimonials arrive as parallel indexed fields.
  const quotes = formData.getAll("t_quote").map(String);
  const names = formData.getAll("t_name").map(String);
  const roles = formData.getAll("t_role").map(String);
  const churches = formData.getAll("t_church").map(String);
  const testimonials = quotes
    .map((quote, i) => ({
      quote: quote.trim(),
      name: (names[i] ?? "").trim(),
      role: (roles[i] ?? "").trim(),
      church: (churches[i] ?? "").trim(),
    }))
    .filter((t) => t.quote && t.name);

  const content: MarketingContent = { heroSubhead, testimonials };
  await saveMarketingContent(content);
  revalidatePath("/admin/content");
  revalidatePath("/", "layout");
}

// ── Announcements / broadcast ──
export async function createAnnouncement(formData: FormData) {
  await requireSuperAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const level = String(formData.get("level") ?? "info").trim() || "info";
  if (!title || !body) return;
  const endsRaw = String(formData.get("endsAt") ?? "").trim();
  const endsAt = endsRaw ? new Date(endsRaw) : null;
  await db.announcement.create({
    data: { title, body, level, active: true, endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : null },
  });
  revalidatePath("/admin/broadcast");
}

export async function toggleAnnouncement(id: string, active: boolean) {
  await requireSuperAdmin();
  await db.announcement.update({ where: { id }, data: { active } });
  revalidatePath("/admin/broadcast");
}

export async function deleteAnnouncement(id: string) {
  await requireSuperAdmin();
  await db.announcement.delete({ where: { id } });
  revalidatePath("/admin/broadcast");
}

// ── Payment requests ──
export async function updatePaymentRequest(id: string, formData: FormData): Promise<{ notified: string[] }> {
  await requireSuperAdmin();
  const status = String(formData.get("status") ?? "").trim();
  const adminNotes = String(formData.get("adminNotes") ?? "").trim();
  const meetingDateStr = String(formData.get("meetingDate") ?? "").trim();
  const meetingType = String(formData.get("meetingType") ?? "").trim();
  const ussdCode = String(formData.get("ussdCode") ?? "").trim();
  const portalUrl = String(formData.get("portalUrl") ?? "").trim();
  const paystackSubId = String(formData.get("paystackSubId") ?? "").trim();

  const before = await db.paymentRequest.findUnique({
    where: { id },
    select: { status: true, meetingDate: true, meetingType: true, contactName: true, contactPhone: true, contactEmail: true, church: { select: { name: true } } },
  });
  const meetingDate = meetingDateStr ? new Date(meetingDateStr) : null;

  const updated = await db.paymentRequest.update({
    where: { id },
    data: {
      status: status || undefined,
      adminNotes: adminNotes || null,
      meetingDate,
      meetingType: meetingType || null,
      ussdCode: ussdCode || null,
      portalUrl: portalUrl || null,
      paystackSubId: paystackSubId || null,
    },
    select: { churchId: true },
  });

  // This code is what actually routes the church's online giving to their own
  // Paystack account (see initializePayment) - keep the Church record in sync
  // so saving it here takes effect immediately, not just as a note on file.
  await db.church.update({
    where: { id: updated.churchId },
    data: { paystackSubaccountCode: paystackSubId || null },
  });

  revalidatePath("/admin/payments");

  // Tell the church when its request moves, or when its meeting changes. Saving notes alone stays silent.
  let notified: string[] = [];
  if (before) {
    const statusChanged = !!status && status !== before.status;
    const meetingChanged = (before.meetingDate?.getTime() ?? 0) !== (meetingDate?.getTime() ?? 0) || (before.meetingType ?? "") !== meetingType;
    let event: PaymentRequestEvent | null = null;
    if (status === "scheduled" && (statusChanged || meetingChanged)) event = { kind: "scheduled", meetingDate, meetingType: meetingType || null };
    else if (statusChanged && status === "in_progress") event = { kind: "in_progress" };
    else if (statusChanged && status === "completed") event = { kind: "completed" };
    else if (statusChanged && status === "declined") event = { kind: "declined" };
    if (event) {
      const r = await notifyPaymentRequest({ event, churchName: before.church.name, contactName: before.contactName, contactPhone: before.contactPhone, contactEmail: before.contactEmail });
      notified = [r.sms ? "text" : "", r.email ? "email" : ""].filter(Boolean);
    }
  }
  return { notified };
}

/**
 * Approve a church's online-giving setup: create their Paystack subaccount from
 * the bank/MoMo account they submitted, store the ACCT code on the church (so
 * giving starts routing to them), and mark the request completed. The platform
 * split (% WorshipHQ keeps) comes from PlatformConfig.givingPlatformPercent.
 */
export async function approveGivingSetup(id: string): Promise<{ ok: boolean; code?: string; error?: string }> {
  await requireSuperAdmin();
  const req = await db.paymentRequest.findUnique({
    where: { id },
    include: { church: { select: { id: true, name: true, slug: true, paystackSubaccountCode: true } } },
  });
  if (!req) return { ok: false, error: "Request not found." };
  if (req.church.paystackSubaccountCode) return { ok: false, error: "This church already has a subaccount." };
  if (!req.bankCode || !req.accountNumber || !req.accountName) {
    return { ok: false, error: "This request has no verified settlement account to create a subaccount from." };
  }

  // WorshipHQ's cut is applied on each gift (see splitGift), so the subaccount itself always starts at 0%.
  // That way changing a church's split later, or the platform default, never depends on how it was created.
  const percentageCharge = 0;

  const host = env.NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const res = await createSubaccount({
    businessName: req.church.name,
    settlementBank: req.bankCode,
    accountNumber: req.accountNumber,
    percentageCharge,
    description: `WorshipHQ giving for ${req.church.name} (${req.church.slug}.${host})`,
    primaryContactEmail: req.contactEmail,
    primaryContactPhone: req.contactPhone,
  });
  if (!res.ok || !res.subaccountCode) return { ok: false, error: res.error ?? "Paystack did not return a subaccount code." };

  await db.paymentRequest.update({
    where: { id },
    data: { paystackSubId: res.subaccountCode, status: "completed" },
  });
  await db.church.update({
    where: { id: req.church.id },
    data: { paystackSubaccountCode: res.subaccountCode },
  });

  revalidatePath("/admin/payments");
  await notifyPaymentRequest({ event: { kind: "completed" }, churchName: req.church.name, contactName: req.contactName, contactPhone: req.contactPhone, contactEmail: req.contactEmail });
  return { ok: true, code: res.subaccountCode };
}

/** SuperAdmin: set the online-giving fee model (platform split + who bears Paystack's fee). */
export async function setGivingFeeSettings(input: { platformPercent: number; donorBearsFee: boolean; paystackFeePercent: number }) {
  await requireSuperAdmin();
  const platformPercent = Math.max(0, Math.min(Number(input.platformPercent) || 0, 100));
  const paystackFeePercent = Math.max(0, Math.min(Number(input.paystackFeePercent) || 0, 20));
  await db.platformConfig.upsert({
    where: { id: "default" },
    update: { givingPlatformPercent: platformPercent, givingDonorBearsFee: !!input.donorBearsFee, paystackFeePercent },
    create: { id: "default", currency: "USD", currencySymbol: "$", givingPlatformPercent: platformPercent, givingDonorBearsFee: !!input.donorBearsFee, paystackFeePercent },
  });
  revalidatePath("/admin/payments");
  return { ok: true as const };
}

/** SuperAdmin: set how one church's giving fees work, whatever the church chose. A percent of null goes back to the platform default. */
export async function adminSetChurchGiving(churchId: string, input: { mode?: string; platformPercent?: number | null }): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  const mode = input.mode;
  if (mode !== undefined && !isFeeMode(mode)) return { ok: false, error: "Choose who pays the fee." };
  let percent: number | null | undefined = undefined;
  if (input.platformPercent !== undefined) {
    percent = input.platformPercent === null ? null : Math.max(0, Math.min(Number(input.platformPercent) || 0, 100));
  }
  try {
    await saveGivingSettings(churchId, { ...(mode ? { mode } : {}), ...(percent !== undefined ? { platformPercent: percent } : {}) });
  } catch {
    return { ok: false, error: "The giving settings table is not in the database yet. Run the database update first." };
  }
  revalidatePath("/admin/payments");
  return { ok: true };
}

// ── Payout account management (SuperAdmin) ──────────────────────────────

/** Banks / MoMo providers for the SuperAdmin edit form (church actions need a church session). */
export async function adminGivingBanks(type: "bank" | "momo") {
  await requireSuperAdmin();
  const res = await listBanks({ type: type === "momo" ? "mobile_money" : "ghipss" });
  return { ok: res.ok, banks: res.banks.map((b) => ({ name: b.name, code: b.code })), error: res.error };
}

export async function adminVerifyAccount(accountNumber: string, bankCode: string) {
  await requireSuperAdmin();
  const num = accountNumber.replace(/\s+/g, "");
  if (!num || !bankCode) return { ok: false as const, error: "Enter an account number and choose a provider." };
  const res = await resolveAccount(num, bankCode);
  if (!res.ok) return { ok: false as const, error: res.error ?? "Could not verify that account." };
  return { ok: true as const, accountName: res.accountName ?? "" };
}

async function loadPayoutRequest(id: string) {
  return db.paymentRequest.findUnique({
    where: { id },
    include: { church: { select: { id: true, name: true, slug: true, paystackSubaccountCode: true, givingBlocked: true } } },
  });
}

const CLEAR_PENDING = {
  pendingSettlementType: null, pendingBankCode: null, pendingBankName: null,
  pendingAccountNumber: null, pendingAccountName: null, pendingAt: null,
} as const;

/** Apply a church's requested payout-account change: update the Paystack subaccount first, then our records. */
export async function approveAccountChange(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  const req = await loadPayoutRequest(id);
  if (!req) return { ok: false, error: "Request not found." };
  if (!req.pendingBankCode || !req.pendingAccountNumber || !req.pendingAccountName) return { ok: false, error: "There is no pending change." };

  const code = req.church.paystackSubaccountCode;
  if (code) {
    const res = await updateSubaccount(code, { settlementBank: req.pendingBankCode, accountNumber: req.pendingAccountNumber });
    if (!res.ok) return { ok: false, error: res.error ?? "Paystack did not accept the new account." };
  }
  await db.paymentRequest.update({
    where: { id },
    data: {
      settlementType: req.pendingSettlementType, bankCode: req.pendingBankCode, bankName: req.pendingBankName,
      accountNumber: req.pendingAccountNumber, accountName: req.pendingAccountName,
      ...CLEAR_PENDING,
    },
  });
  revalidatePath("/admin/payments");
  await notifyPaymentRequest({ event: { kind: "change_approved" }, churchName: req.church.name, contactName: req.contactName, contactPhone: req.contactPhone, contactEmail: req.contactEmail });
  return { ok: true };
}

export async function rejectAccountChange(id: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  const req = await loadPayoutRequest(id);
  if (!req) return { ok: false, error: "Request not found." };
  await db.paymentRequest.update({
    where: { id },
    data: {
      ...CLEAR_PENDING,
      ...(note?.trim() ? { adminNotes: `${req.adminNotes ? req.adminNotes + "\n" : ""}Change declined: ${note.trim()}` } : {}),
    },
  });
  revalidatePath("/admin/payments");
  return { ok: true };
}

/** Emergency brake (e.g. suspected scam): switch the subaccount OFF at Paystack and block the
 *  church's online giving. Everything is kept so it can be investigated or restored. */
export async function revokeGivingAccess(id: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  const req = await loadPayoutRequest(id);
  if (!req) return { ok: false, error: "Request not found." };

  const code = req.church.paystackSubaccountCode;
  if (code) {
    const res = await updateSubaccount(code, { active: false });
    if (!res.ok) return { ok: false, error: res.error ?? "Paystack did not deactivate the subaccount. Nothing was changed." };
  }
  await db.church.update({ where: { id: req.church.id }, data: { givingBlocked: true } });
  await db.paymentRequest.update({
    where: { id },
    data: { status: "revoked", ...(reason?.trim() ? { adminNotes: `${req.adminNotes ? req.adminNotes + "\n" : ""}Revoked: ${reason.trim()}` } : {}) },
  });
  revalidatePath("/admin/payments");
  return { ok: true };
}

export async function restoreGivingAccess(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  const req = await loadPayoutRequest(id);
  if (!req) return { ok: false, error: "Request not found." };

  const code = req.church.paystackSubaccountCode;
  if (code) {
    const res = await updateSubaccount(code, { active: true });
    if (!res.ok) return { ok: false, error: res.error ?? "Paystack did not reactivate the subaccount." };
  }
  await db.church.update({ where: { id: req.church.id }, data: { givingBlocked: false } });
  await db.paymentRequest.update({ where: { id }, data: { status: "completed" } });
  revalidatePath("/admin/payments");
  return { ok: true };
}

/** Delete the payout account entirely. Paystack has no delete endpoint for subaccounts, so the
 *  subaccount is DEACTIVATED there (it can never receive a split again) before our record is removed. */
export async function deletePaymentAccount(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  const req = await loadPayoutRequest(id);
  if (!req) return { ok: false, error: "Request not found." };

  const code = req.church.paystackSubaccountCode;
  if (code) {
    const res = await updateSubaccount(code, { active: false });
    if (!res.ok) return { ok: false, error: res.error ?? "Paystack did not deactivate the subaccount. Nothing was deleted." };
  }
  await db.church.update({ where: { id: req.church.id }, data: { paystackSubaccountCode: null, givingBlocked: false } });
  await db.paymentRequest.delete({ where: { id } });
  revalidatePath("/admin/payments");
  return { ok: true };
}

/** SuperAdmin edits the church's payout account directly (after verifying the new name). */
export async function adminEditPaymentAccount(id: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  const req = await loadPayoutRequest(id);
  if (!req) return { ok: false, error: "Request not found." };

  const settlementType = String(formData.get("settlementType") ?? "").trim();
  const bankCode = String(formData.get("bankCode") ?? "").trim();
  const bankName = String(formData.get("bankName") ?? "").trim();
  const accountNumber = String(formData.get("accountNumber") ?? "").replace(/\s+/g, "");
  const accountName = String(formData.get("accountName") ?? "").trim();
  if (!(settlementType && bankCode && accountNumber && accountName)) return { ok: false, error: "Verify the account name before saving." };

  const code = req.church.paystackSubaccountCode;
  if (code) {
    const res = await updateSubaccount(code, { settlementBank: bankCode, accountNumber });
    if (!res.ok) return { ok: false, error: res.error ?? "Paystack did not accept the new account." };
  }
  await db.paymentRequest.update({
    where: { id },
    data: { settlementType, bankCode, bankName: bankName || null, accountNumber, accountName, ...CLEAR_PENDING },
  });
  revalidatePath("/admin/payments");
  return { ok: true };
}

// ── SMS pricing tiers ──

/** Set the site-wide SMS pricing tier (applies to every church without an override). */
export async function setPlatformSmsTier(tier: string) {
  await requireSuperAdmin();
  if (!isSmsTier(tier)) return { ok: false as const, error: "Invalid tier." };
  await db.platformConfig.upsert({
    where: { id: "default" },
    update: { smsTier: tier },
    create: { id: "default", smsTier: tier },
  });
  revalidatePath("/admin/pricing");
  revalidatePath("/app/communications/credits");
  return { ok: true as const };
}

/** Override (or clear) a single church's SMS tier. Empty string = inherit default. */
export async function setChurchSmsTier(churchId: string, tier: string) {
  await requireSuperAdmin();
  const value = isSmsTier(tier) ? tier : null;
  await db.church.update({ where: { id: churchId }, data: { smsTier: value } });
  revalidatePath("/admin");
  return { ok: true as const };
}

/**
 * Put a church on a plan for a stated length of time, and record it in their billing history either as a gift or
 * as money received outside the app (cash, bank transfer, Mobile Money to you directly). The term can be any number
 * of months, so 3 years is 36 and 5 years is 60. If the church is already on that plan the time is added to the end
 * of what they have, so nobody loses days.
 */
export async function recordChurchPlan(input: {
  churchId: string;
  plan: string;
  months: number;
  mode: "gift" | "paid";
  /** What was actually received now, in GHS (only for mode "paid"). */
  amountGhs?: number;
  /** The price agreed for the whole term, after any discount. More than amountGhs means a balance is still owed. Left out = paid in full. */
  agreedGhs?: number;
  /** How much was taken off the standard price (shown on the receipt). */
  discountGhs?: number;
  /** Who paid, as it should read on the receipt ("Received from"). Left out = the church's Owner. */
  receivedFrom?: string;
  receivedFromEmail?: string;
  /** How it was paid, for example "Mobile Money" or "Bank transfer". */
  method?: string;
  note?: string;
  /**
   * false = the church is already on this plan with time left, and you only want the payment written down
   * (for example a church you switched on before the money arrived). Their dates stay exactly as they are.
   */
  extend?: boolean;
  /** Email (and text) the church a PDF receipt for this. */
  sendReceipt?: boolean;
}): Promise<{ ok: true; renewsAt: string; receipt?: { id: string; number: string; balance: number } } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const plans = ["starter", "pro", "max"];
  if (!plans.includes(input.plan)) return { ok: false, error: "Choose a plan." };
  const months = Math.round(Number(input.months));
  if (!Number.isFinite(months) || months < 1 || months > 120) return { ok: false, error: "Choose a length between 1 and 120 months." };
  const church = await db.church.findUnique({ where: { id: input.churchId }, select: { id: true, name: true } });
  if (!church) return { ok: false, error: "Church not found." };
  const paid = input.mode === "paid";
  const amountGhs = paid ? Math.round((Number(input.amountGhs) || 0) * 100) / 100 : 0;
  if (paid && amountGhs <= 0) return { ok: false, error: "Enter how much they paid." };
  const agreedGhs = paid ? Math.round((Number(input.agreedGhs) || amountGhs) * 100) / 100 : 0;
  const discountGhs = paid ? Math.max(0, Math.round((Number(input.discountGhs) || 0) * 100) / 100) : 0;
  if (paid && amountGhs > agreedGhs + 0.005) return { ok: false, error: "They cannot have paid more than the price for this term." };
  const balanceGhs = paid ? Math.round(Math.max(agreedGhs - amountGhs, 0) * 100) / 100 : 0;

  const config = await db.platformConfig.findUnique({ where: { id: "default" }, select: { usdToGhsRate: true, planPrices: true } });
  const rate = config?.usdToGhsRate ?? 12;
  const prices = ((config?.planPrices as Record<string, { monthly: number; yearly: number }> | null) ?? {})[input.plan];
  const listUsd = prices ? (months >= 12 ? (prices.yearly / 12) * months : prices.monthly * months) : 0;

  const sub = await db.subscription.findUnique({ where: { churchId: church.id } });
  const now = new Date();
  const sameAndActive = sub && sub.plan === input.plan && sub.renewsAt && sub.renewsAt > now;
  const extend = input.extend !== false;
  if (!extend && !sameAndActive) return { ok: false, error: "That church is not on this plan right now, so there is nothing to attach the payment to. Leave \"add the time\" ticked." };
  const start = extend ? (sameAndActive ? sub!.renewsAt! : now) : new Date(sub!.renewsAt!);
  const end = new Date(start);
  if (extend) end.setMonth(end.getMonth() + months);
  else start.setMonth(start.getMonth() - months); // the period this payment covers ends where their plan already ends

  if (extend) await db.subscription.upsert({
    where: { churchId: church.id },
    create: { churchId: church.id, plan: input.plan, interval: months >= 12 ? "yearly" : "monthly", status: "active", periodStart: now, renewsAt: end },
    update: {
      plan: input.plan, interval: months >= 12 ? "yearly" : "monthly", status: "active",
      periodStart: sameAndActive ? sub!.periodStart ?? now : now, renewsAt: end,
      bypassPlan: null, bypassCode: null, scheduledPlan: null, scheduledAt: null, cancelAtPeriodEnd: false,
    },
  });

  const reference = `${paid ? "OFFLINE" : "GIFT"}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await db.planPayment.create({
    data: {
      churchId: church.id,
      reference,
      plan: input.plan,
      interval: months >= 12 ? "yearly" : "monthly",
      amountUsd: paid ? amountGhs / rate : listUsd, // for a gift this is the value given away
      amountGhs,
      discountUsd: paid ? discountGhs / rate : 0,
      usdToGhsRate: rate,
      kind: "new",
      periodStart: start,
      periodEnd: end,
      source: paid ? "offline" : "granted",
      termMonths: months,
      note: [
        paid ? (input.method ? `Paid by ${input.method}` : "Paid outside the app") : "Gift from WorshipHQ",
        paid && balanceGhs > 0 ? `Part payment of GH₵${amountGhs.toLocaleString("en-GB", { minimumFractionDigits: 2 })} towards GH₵${agreedGhs.toLocaleString("en-GB", { minimumFractionDigits: 2 })}` : "",
        input.note?.trim(),
      ].filter(Boolean).join(". "),
    },
  });

  const planName = input.plan.charAt(0).toUpperCase() + input.plan.slice(1);
  const interval = months >= 12 ? "yearly" : "monthly";
  // A payment you received always gets a receipt you can open and hand over; emailing it is a separate choice.
  let receipt: { id: string; number: string; balance: number } | undefined;
  if (paid) {
    try {
      const { issueUpgradeReceipt } = await import("@/lib/receipts/service");
      const { receiptNumber } = await import("@/lib/receipts/types");
      const issued = await issueUpgradeReceipt({
        churchId: church.id, planName, interval, reference, amount: amountGhs, discount: discountGhs, agreed: agreedGhs,
        from: start, to: end, kind: "upgrade", method: input.method?.trim() || "Paid directly", termMonths: months,
        toName: input.receivedFrom?.trim().slice(0, 120) || undefined, toEmail: input.receivedFromEmail?.trim() || null,
      });
      if (issued) receipt = { id: issued.row.id, number: receiptNumber(issued.row), balance: balanceGhs };
    } catch (e) {
      console.error("[record plan receipt]", (e as Error).message);
    }
  }
  if (input.sendReceipt) {
    const label = months % 12 === 0 ? `${months / 12} year${months === 12 ? "" : "s"}` : `${months} month${months === 1 ? "" : "s"}`;
    try {
      const { sendUpgradeReceipt } = await import("@/lib/billing/receipt");
      await sendUpgradeReceipt(church.id, planName, paid ? `GH₵${amountGhs.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${label})` : `Gift (${label})`, interval, reference, {
        amountGhs, from: start, to: end, kind: paid ? "upgrade" : "gift", method: paid ? input.method?.trim() || "Paid directly" : undefined,
      });
    } catch (e) {
      console.error("[record plan receipt]", (e as Error).message);
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/revenue");
  revalidatePath("/admin/receipts");
  return { ok: true, renewsAt: end.toISOString(), receipt };
}

/** What the SMS provider charges per credit, used for the SMS profit figures. */
export async function setSmsCostPerCredit(cost: number) {
  await requireSuperAdmin();
  const n = Math.round(Number(cost) * 10000) / 10000;
  if (!Number.isFinite(n) || n <= 0 || n > 5) return { ok: false as const, error: "Enter a cost between 0 and 5 cedis." };
  await db.platformConfig.upsert({ where: { id: "default" }, update: { smsCostPerCredit: n }, create: { id: "default", smsCostPerCredit: n } });
  revalidatePath("/admin/revenue");
  return { ok: true as const };
}
