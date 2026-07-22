"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { suggestCouponCode } from "@/lib/billing/coupons";

const PLANS = ["starter", "pro", "max"];

/** SuperAdmin: issue a single-use discount code. */
export async function createCoupon(formData: FormData) {
  await requireSuperAdmin();

  const discountType = String(formData.get("discountType") ?? "percent") === "fixed" ? "fixed" : "percent";
  const discountValue = parseFloat(String(formData.get("discountValue") ?? "0"));
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return { ok: false, error: "Enter a discount greater than zero." };
  }
  if (discountType === "percent" && discountValue > 100) {
    return { ok: false, error: "A percentage discount can't exceed 100%." };
  }

  // Custom code if given, otherwise generate one.
  const raw = String(formData.get("code") ?? "").trim();
  const code = (raw || suggestCouponCode(discountType, discountValue)).replace(/\s+/g, "").toUpperCase();
  if (code.length < 4) return { ok: false, error: "Code must be at least 4 characters." };

  const existing = await db.coupon.findFirst({ where: { code: { equals: code, mode: "insensitive" } } });
  if (existing) return { ok: false, error: `Code "${code}" already exists.` };

  const planRaw = String(formData.get("plan") ?? "").trim();
  const intervalRaw = String(formData.get("interval") ?? "").trim();
  const churchId = String(formData.get("churchId") ?? "").trim() || null;
  const expiresAtRaw = String(formData.get("expiresAt") ?? "").trim();

  await db.coupon.create({
    data: {
      code,
      discountType,
      discountValue,
      plan: PLANS.includes(planRaw) ? planRaw : null,
      interval: intervalRaw === "monthly" || intervalRaw === "yearly" ? intervalRaw : null,
      churchId,
      note: String(formData.get("note") ?? "").trim() || null,
      expiresAt: expiresAtRaw ? new Date(expiresAtRaw) : null,
    },
  });

  revalidatePath("/admin/pricing");
  return { ok: true, code };
}

export async function deleteCoupon(id: string) {
  await requireSuperAdmin();
  await db.coupon.delete({ where: { id } }).catch(() => {});
  revalidatePath("/admin/pricing");
}
