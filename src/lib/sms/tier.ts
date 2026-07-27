import "server-only";
import { db } from "@/lib/db";
import { bundlesForTier, isSmsTier, DEFAULT_SMS_TIER, type SmsBundle, type SmsTier } from "@/config/sms";

/**
 * A church's effective SMS pricing tier: its own override if set, otherwise the
 * site-wide default from PlatformConfig, otherwise the hard default (D).
 */
export async function resolveSmsTier(churchId: string): Promise<SmsTier> {
  const [church, config] = await Promise.all([
    db.church.findUnique({ where: { id: churchId }, select: { smsTier: true } }),
    db.platformConfig.findUnique({ where: { id: "default" }, select: { smsTier: true } }),
  ]);
  if (isSmsTier(church?.smsTier)) return church.smsTier;
  if (isSmsTier(config?.smsTier)) return config.smsTier;
  return DEFAULT_SMS_TIER;
}

/** The bundles a church should see & be charged, honouring its tier. */
export async function smsBundlesForChurch(churchId: string): Promise<{ tier: SmsTier; bundles: SmsBundle[] }> {
  const tier = await resolveSmsTier(churchId);
  return { tier, bundles: bundlesForTier(tier) };
}
