import "server-only";
import { db } from "@/lib/db";
import { isFeeMode, type FeeMode } from "@/lib/giving/fees";
import { getChurchPlan } from "@/lib/plan-gate-server";
import { getPlatformConfig } from "@/lib/data/platform-config";

export interface GivingSettings {
  /** Who pays Paystack's fee on this church's online gifts. */
  mode: FeeMode;
  /** WorshipHQ's platform cut, as a percent of each gift. */
  platformPercent: number;
  /** True when this church has its own choice saved (not just the platform default). */
  custom: boolean;
  /** True when WorshipHQ set a platform percent for this church specifically. */
  customPercent: boolean;
  /** The church's plan and its name, because the platform percent follows the plan unless set for this church. */
  plan: string;
  planName: string;
}

/**
 * This church's giving fee settings: its own choice if it has made one, else the platform default.
 * If the settings table has not been created yet, the platform default applies, so giving keeps working.
 */
export async function getGivingSettings(churchId: string): Promise<GivingSettings> {
  const [cfg, own, plan, platform] = await Promise.all([
    db.platformConfig.findUnique({ where: { id: "default" }, select: { givingDonorBearsFee: true, givingPlatformPercent: true } }),
    db.churchGivingSettings.findUnique({ where: { churchId } }).catch(() => null),
    getChurchPlan(churchId),
    getPlatformConfig(),
  ]);
  const defaultMode: FeeMode = (cfg?.givingDonorBearsFee ?? true) ? "giver" : "church";
  const def = platform.planDefs[plan];
  // The church's own percent wins, then its plan's, then the platform-wide one.
  const planPercent = typeof def?.givingPercent === "number" ? def.givingPercent : cfg?.givingPlatformPercent ?? 0;
  return {
    mode: isFeeMode(own?.feeMode) ? own.feeMode : defaultMode,
    platformPercent: typeof own?.platformPercent === "number" ? own.platformPercent : planPercent,
    custom: isFeeMode(own?.feeMode),
    customPercent: typeof own?.platformPercent === "number",
    plan,
    planName: def?.name ?? plan,
  };
}

/** Save the church's fee choice and/or a platform percent set for this church. Throws if the table does not exist yet. */
export async function saveGivingSettings(churchId: string, changes: { mode?: FeeMode; platformPercent?: number | null }): Promise<void> {
  const data: { feeMode?: string; platformPercent?: number | null } = {};
  if (changes.mode) data.feeMode = changes.mode;
  if (changes.platformPercent !== undefined) data.platformPercent = changes.platformPercent;
  await db.churchGivingSettings.upsert({
    where: { churchId },
    create: { churchId, feeMode: changes.mode ?? "giver", platformPercent: changes.platformPercent ?? null },
    update: data,
  });
}
