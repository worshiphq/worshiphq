"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdminOwner } from "@/lib/auth";

/**
 * The owner's record of SMS bought from the provider. Owner only, each action guarded on its own (the audit
 * found the house habit was to guard the page and leave the actions open, and this is financial data).
 */

/**
 * Record a top-up of the provider account, or a reading of its balance (kind "balance": the starting point the
 * stock figures count forward from). The owner enters the AMOUNT paid, because that is what is bought:
 * the provider then deducts a fixed price per SMS segment as messages go out. The units that amount is worth
 * are worked out here from the provider cost per credit (the figure on the Revenue page) and stored, so an
 * old top-up keeps the units it was worth at the time even if that price changes later.
 */
export async function addSmsPurchase(input: { amountGhs: number; kind?: "topup" | "balance"; provider?: string; note?: string; date?: string }) {
  await requireSuperAdminOwner();
  const costGhs = Math.round(Number(input.amountGhs) * 100) / 100;
  const kind = input.kind === "balance" ? "balance" : "topup";
  if (!Number.isFinite(costGhs) || costGhs < 0 || (kind === "topup" && costGhs === 0)) {
    return { ok: false as const, error: kind === "balance" ? "Enter the balance Hubtel shows, in cedis." : "Enter the amount you topped up, in cedis." };
  }
  const purchasedAt = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(purchasedAt.getTime())) return { ok: false as const, error: "That date is not valid." };

  const cfg = await db.platformConfig.findUnique({ where: { id: "default" }, select: { smsCostPerCredit: true } });
  const perCredit = cfg?.smsCostPerCredit ?? 0.03;
  if (!(perCredit > 0)) return { ok: false as const, error: "Set the provider cost per credit on this page first." };
  const credits = Math.floor(costGhs / perCredit);

  try {
    await db.smsPurchase.create({
      data: { kind, credits, costGhs, provider: input.provider?.trim() || null, note: input.note?.trim() || null, purchasedAt },
    });
  } catch {
    return { ok: false as const, error: "The SMS purchases table has not been created yet. Run sql/sms-purchases.sql in Supabase." };
  }
  revalidatePath("/admin/revenue");
  return { ok: true as const, credits };
}

export async function deleteSmsPurchase(id: string) {
  await requireSuperAdminOwner();
  await db.smsPurchase.deleteMany({ where: { id } });
  revalidatePath("/admin/revenue");
  return { ok: true as const };
}
