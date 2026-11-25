"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/admin-audit";
import { invalidatePlatformConfig } from "@/lib/data/platform-config";
import { normalizePromotions, type Promotions } from "@/lib/promotions";

/** Opens WorshipHQ Live to everyone (or closes it again), straight away and without touching anything else on the page. */
export async function setLiveLaunched(on: boolean): Promise<{ ok: boolean; error?: string; installer?: boolean }> {
  await requireSuperAdmin();
  const { liveInstallerReady } = await import("@/lib/live-release");
  invalidatePlatformConfig();
  const row = await db.platformConfig.findUnique({ where: { id: "default" }, select: { promotions: true } });
  const p = normalizePromotions(row?.promotions);
  const next = { ...p, launch: { ...p.launch, on } };
  await logAdminAction("setLiveLaunched", { on });
  await db.platformConfig.upsert({ where: { id: "default" }, update: { promotions: next as object }, create: { id: "default", promotions: next as object } });
  invalidatePlatformConfig();
  revalidatePath("/admin/pricing");
  revalidatePath("/", "layout");
  return { ok: true, installer: await liveInstallerReady() };
}

/** SuperAdmin › Pricing › Promotions: save the plan step-up, free Media and Media discounts. */
export async function savePromotions(input: Promotions): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  const p = normalizePromotions(input);
  const saved = await db.platformConfig.findUnique({ where: { id: "default" }, select: { promotions: true } });
  p.launch.on = normalizePromotions(saved?.promotions).launch.on;
  for (const w of [p.stepUp, p.mediaFree, p.mediaDiscount]) {
    if (w.end && w.end < w.start) return { ok: false, error: "An end date is before its start date." };
  }
  await logAdminAction("savePromotions", p as unknown as Record<string, unknown>);
  await db.platformConfig.upsert({
    where: { id: "default" },
    update: { promotions: p as object },
    create: { id: "default", promotions: p as object },
  });
  invalidatePlatformConfig();
  revalidatePath("/admin/pricing");
  // The launch, the prices and the free dates show on the public pages (menu, pricing, /live).
  revalidatePath("/", "layout");
  return { ok: true };
}
