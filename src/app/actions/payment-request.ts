"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { listBanks, resolveAccount, updateSubaccount } from "@/lib/integrations/paystack";

/** Only the church's Owner or Admin may touch where its giving pays out. */
async function requireGivingAdmin() {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") throw new Error("Only an Owner or Admin can manage online giving.");
  return session;
}

/** Banks / MoMo providers the church can settle online giving to. */
export async function getGivingBanks(type: "bank" | "momo") {
  await requireSession();
  const res = await listBanks({ type: type === "momo" ? "mobile_money" : "ghipss" });
  return { ok: res.ok, banks: res.banks.map((b) => ({ name: b.name, code: b.code })), error: res.error };
}

/** Verify an account/MoMo number and return the name on it, for the confirm step. */
export async function verifyGivingAccount(accountNumber: string, bankCode: string) {
  await requireSession();
  const num = accountNumber.replace(/\s+/g, "");
  if (!num || !bankCode) return { ok: false as const, error: "Enter an account number and choose a provider." };
  const res = await resolveAccount(num, bankCode);
  if (!res.ok) return { ok: false as const, error: res.error ?? "Could not verify that account." };
  return { ok: true as const, accountName: res.accountName ?? "" };
}

function readSettlement(formData: FormData) {
  return {
    settlementType: String(formData.get("settlementType") ?? "").trim(),
    bankCode: String(formData.get("bankCode") ?? "").trim(),
    bankName: String(formData.get("bankName") ?? "").trim(),
    accountNumber: String(formData.get("accountNumber") ?? "").replace(/\s+/g, ""),
    accountName: String(formData.get("accountName") ?? "").trim(),
  };
}

export async function submitPaymentRequest(formData: FormData) {
  const session = await requireGivingAdmin();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const contactPhone = String(formData.get("contactPhone") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  const needs = String(formData.get("needs") ?? "").trim();
  const s = readSettlement(formData);

  if (!contactName) return { error: "Contact name is required" };
  if (!(s.settlementType && s.bankCode && s.accountNumber && s.accountName)) {
    return { error: "Choose a provider, enter the account number, and verify the name before submitting." };
  }

  const church = await db.church.findUnique({ where: { id: session.churchId }, select: { givingBlocked: true, paystackSubaccountCode: true } });
  if (church?.givingBlocked) return { error: "Online giving has been suspended for this church. Please contact WorshipHQ support." };

  const existing = await db.paymentRequest.findFirst({
    where: { churchId: session.churchId, status: { in: ["pending", "scheduled", "in_progress", "completed", "revoked"] } },
  });
  if (existing) {
    return { error: existing.status === "completed" ? "You already have a payment account. Use Edit to change it." : "You already have an active payment request." };
  }

  await db.paymentRequest.create({
    data: {
      churchId: session.churchId,
      requestedBy: session.userId,
      contactName,
      contactPhone: contactPhone || null,
      contactEmail: contactEmail || null,
      needs: needs || null,
      settlementType: s.settlementType,
      bankCode: s.bankCode,
      bankName: s.bankName || null,
      accountNumber: s.accountNumber,
      accountName: s.accountName,
    },
  });

  await audit(session, "create", "payment-account", "Submitted an online giving payout account for approval");
  revalidatePath("/app/settings");
  return { success: true };
}

export async function getPaymentRequestStatus() {
  const session = await requireSession();
  const [request, church] = await Promise.all([
    db.paymentRequest.findFirst({
      where: { churchId: session.churchId, status: { notIn: ["removed", "cancelled"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, status: true, meetingDate: true, meetingType: true,
        adminNotes: true, ussdCode: true, portalUrl: true, createdAt: true,
        settlementType: true, bankName: true, accountNumber: true, accountName: true,
        pendingSettlementType: true, pendingBankName: true, pendingAccountNumber: true, pendingAccountName: true, pendingAt: true,
      },
    }),
    db.church.findUnique({ where: { id: session.churchId }, select: { givingBlocked: true } }),
  ]);
  return request ? { ...request, givingBlocked: church?.givingBlocked ?? false } : null;
}

/** Ask to change where giving pays out. The CURRENT account keeps working until
 *  WorshipHQ approves, so a hijacked admin login can't silently redirect offerings. */
export async function requestAccountChange(formData: FormData) {
  const session = await requireGivingAdmin();
  const s = readSettlement(formData);
  if (!(s.settlementType && s.bankCode && s.accountNumber && s.accountName)) {
    return { error: "Choose a provider, enter the account number, and verify the name before submitting." };
  }
  const req = await db.paymentRequest.findFirst({
    where: { churchId: session.churchId, status: "completed" },
    orderBy: { createdAt: "desc" },
    select: { id: true, accountNumber: true, bankCode: true },
  });
  if (!req) return { error: "There is no approved payment account to change." };
  if (req.accountNumber === s.accountNumber && req.bankCode === s.bankCode) return { error: "That is already your payment account." };

  await db.paymentRequest.update({
    where: { id: req.id },
    data: {
      pendingSettlementType: s.settlementType, pendingBankCode: s.bankCode, pendingBankName: s.bankName || null,
      pendingAccountNumber: s.accountNumber, pendingAccountName: s.accountName, pendingAt: new Date(),
    },
  });
  await audit(session, "update", "payment-account", "Requested a change of online giving payout account");
  revalidatePath("/app/settings");
  return { success: true };
}

export async function cancelAccountChange() {
  const session = await requireGivingAdmin();
  await db.paymentRequest.updateMany({
    where: { churchId: session.churchId, status: "completed" },
    data: { pendingSettlementType: null, pendingBankCode: null, pendingBankName: null, pendingAccountNumber: null, pendingAccountName: null, pendingAt: null },
  });
  revalidatePath("/app/settings");
  return { success: true };
}

/** Withdraw a request that hasn't been approved yet (e.g. to fix a typo and resubmit). */
export async function cancelPaymentRequest() {
  const session = await requireGivingAdmin();
  const res = await db.paymentRequest.updateMany({
    where: { churchId: session.churchId, status: { in: ["pending", "scheduled", "in_progress"] } },
    data: { status: "cancelled" },
  });
  if (res.count > 0) await audit(session, "delete", "payment-account", "Withdrew an online giving setup request");
  revalidatePath("/app/settings");
  return { success: true };
}

/** Disconnect the church's payout account. Deactivates the subaccount on Paystack first,
 *  so it can never receive another gift; if Paystack refuses, nothing is changed. */
export async function removePaymentAccount() {
  const session = await requireGivingAdmin();
  const [church, req] = await Promise.all([
    db.church.findUnique({ where: { id: session.churchId }, select: { paystackSubaccountCode: true, givingBlocked: true } }),
    db.paymentRequest.findFirst({ where: { churchId: session.churchId, status: "completed" }, orderBy: { createdAt: "desc" }, select: { id: true } }),
  ]);
  if (church?.givingBlocked) return { error: "Online giving has been suspended. Please contact WorshipHQ support." };
  if (!req) return { error: "There is no approved payment account to remove." };

  if (church?.paystackSubaccountCode) {
    const res = await updateSubaccount(church.paystackSubaccountCode, { active: false });
    if (!res.ok) return { error: res.error ?? "Could not switch the account off at Paystack. Nothing was changed." };
  }
  await db.church.update({ where: { id: session.churchId }, data: { paystackSubaccountCode: null } });
  await db.paymentRequest.update({
    where: { id: req.id },
    data: { status: "removed", pendingSettlementType: null, pendingBankCode: null, pendingBankName: null, pendingAccountNumber: null, pendingAccountName: null, pendingAt: null },
  });
  await audit(session, "delete", "payment-account", "Removed the online giving payout account");
  revalidatePath("/app/settings");
  return { success: true };
}
