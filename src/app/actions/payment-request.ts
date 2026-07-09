"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export async function submitPaymentRequest(formData: FormData) {
  const session = await requireSession();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const contactPhone = String(formData.get("contactPhone") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  const needs = String(formData.get("needs") ?? "").trim();

  if (!contactName) return { error: "Contact name is required" };

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
    },
  });
  return request;
}
