"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { listBanks, resolveAccount } from "@/lib/integrations/paystack";

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

export async function submitPaymentRequest(formData: FormData) {
  const session = await requireSession();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const contactPhone = String(formData.get("contactPhone") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  const needs = String(formData.get("needs") ?? "").trim();

  const settlementType = String(formData.get("settlementType") ?? "").trim(); // "bank" | "momo"
  const bankCode = String(formData.get("bankCode") ?? "").trim();
  const bankName = String(formData.get("bankName") ?? "").trim();
  const accountNumber = String(formData.get("accountNumber") ?? "").replace(/\s+/g, "");
  const accountName = String(formData.get("accountName") ?? "").trim();

  if (!contactName) return { error: "Contact name is required" };
  // If they're setting up settlement, require a verified account (name resolved).
  if ((settlementType || bankCode || accountNumber) && !(settlementType && bankCode && accountNumber && accountName)) {
    return { error: "Choose a provider, enter the account number, and confirm the name before submitting." };
  }

  const existing = await db.paymentRequest.findFirst({
    where: { churchId: session.churchId, status: { in: ["pending", "scheduled", "in_progress"] } },
  });
  if (existing) return { error: "You already have an active payment request. Please wait for admin to process it." };

  await db.paymentRequest.create({
    data: {
      churchId: session.churchId,
      requestedBy: session.userId,
      contactName,
      contactPhone: contactPhone || null,
      contactEmail: contactEmail || null,
      needs: needs || null,
      settlementType: settlementType || null,
      bankCode: bankCode || null,
      bankName: bankName || null,
      accountNumber: accountNumber || null,
      accountName: accountName || null,
    },
  });

  revalidatePath("/app/settings");
  return { success: true };
}

export async function getPaymentRequestStatus() {
  const session = await requireSession();
  const request = await db.paymentRequest.findFirst({
    where: { churchId: session.churchId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, status: true, meetingDate: true, meetingType: true,
      adminNotes: true, ussdCode: true, portalUrl: true, createdAt: true,
      settlementType: true, bankName: true, accountNumber: true, accountName: true,
    },
  });
  return request;
}
