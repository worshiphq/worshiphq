"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdminOwner } from "@/lib/auth";

/**
 * The owner's record of SMS bought from the provider. Owner only, each action guarded on its own (the audit
 * found the house habit was to guard the page and leave the actions open, and this is financial data).
 */

export async function addSmsPurchase(input: { credits: number; costGhs: number; provider?: string; note?: string; date?: string }) {
  await requireSuperAdminOwner();
  const credits = Math.round(Number(input.credits));
  const costGhs = Math.round(Number(input.costGhs) * 100) / 100;
  if (!Number.isFinite(credits) || credits <= 0) return { ok: false as const, error: "Enter how many SMS you bought." };
  if (!Number.isFinite(costGhs) || costGhs <= 0) return { ok: false as const, error: "Enter what it cost in cedis." };
  const purchasedAt = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(purchasedAt.getTime())) return { ok: false as const, error: "That date is not valid." };

  try {
    await db.smsPurchase.create({
      data: { credits, costGhs, provider: input.provider?.trim() || null, note: input.note?.trim() || null, purchasedAt },
    });
  } catch {
    return { ok: false as const, error: "The SMS purchases table has not been created yet. Run sql/sms-purchases.sql in Supabase." };
  }
  revalidatePath("/admin/revenue");
  return { ok: true as const };
}

export async function deleteSmsPurchase(id: string) {
  await requireSuperAdminOwner();
  await db.smsPurchase.deleteMany({ where: { id } });
  revalidatePath("/admin/revenue");
  return { ok: true as const };
}
