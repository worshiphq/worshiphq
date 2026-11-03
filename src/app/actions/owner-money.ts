"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdminOwner } from "@/lib/auth";

/**
 * The owner's private money ledger.
 *
 * EVERY action here calls requireSuperAdminOwner(), not requireSuperAdmin(). A partner with an
 * admin SuperAdmin login must never reach this, and the audit that preceded this feature found the
 * house pattern was to guard the page and leave the actions open - so each one is guarded
 * individually, on purpose, even though it looks repetitive.
 */

const LEDGERS = ["site", "personal"] as const;
type Ledger = (typeof LEDGERS)[number];

function cleanLedger(v: unknown): Ledger | null {
  return LEDGERS.includes(v as Ledger) ? (v as Ledger) : null;
}

export async function addMoneyEntry(formData: FormData) {
  await requireSuperAdminOwner();

  const ledger = cleanLedger(String(formData.get("ledger") ?? ""));
  if (!ledger) return { ok: false as const, error: "Unknown book." };

  const kind = String(formData.get("kind") ?? "") === "expense" ? "expense" : "income";
  const amountGhs = Number(String(formData.get("amountGhs") ?? "").replace(/,/g, ""));
  if (!Number.isFinite(amountGhs) || amountGhs <= 0) return { ok: false as const, error: "Enter an amount." };

  const category = String(formData.get("category") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const dateRaw = String(formData.get("occurredAt") ?? "").trim();
  const occurredAt = dateRaw ? new Date(dateRaw) : new Date();
  if (Number.isNaN(occurredAt.getTime())) return { ok: false as const, error: "That date is not valid." };

  await db.ownerLedgerEntry.create({
    data: { ledger, kind, amountGhs: Math.round(amountGhs * 100) / 100, category, note, occurredAt },
  });

  revalidatePath("/admin/money");
  return { ok: true as const };
}

export async function deleteMoneyEntry(id: string) {
  await requireSuperAdminOwner();
  await db.ownerLedgerEntry.deleteMany({ where: { id } });
  revalidatePath("/admin/money");
  return { ok: true as const };
}
