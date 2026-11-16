import "server-only";
import { db } from "@/lib/db";
import {
  INTL_SMS_DEFAULTS, MIN_CUSTOM_CREDITS, MAX_CUSTOM_CREDITS, MIN_INTL_CREDITS, MAX_INTL_CREDITS, SMS_RATE,
  bundlesForTier, foreignCreditsPerSegment, intlBundles, type SmsPricing,
} from "@/config/sms";
import { resolveSmsTier } from "@/lib/sms/tier";
import { isGhana } from "@/lib/billing/local-price";
import { isGhanaNumber } from "@/lib/sms/routing";

/**
 * International SMS prices, set by the owner in SuperAdmin (Revenue page). Kept in SiteContent so no table change is
 * needed. `priceGhs` is what a church pays per segment to a number outside Ghana; `costGhs` is what Nalo charges us.
 */
const KEY = "sms-intl-pricing";

export type IntlSmsPrices = { priceGhs: number; costGhs: number };

export async function getIntlSmsPrices(): Promise<IntlSmsPrices> {
  const row = await db.siteContent.findUnique({ where: { key: KEY } }).catch(() => null);
  const v = (row?.value ?? {}) as Partial<IntlSmsPrices>;
  const priceGhs = Number(v.priceGhs) > 0 ? Number(v.priceGhs) : INTL_SMS_DEFAULTS.priceGhs;
  const costGhs = Number(v.costGhs) > 0 ? Number(v.costGhs) : INTL_SMS_DEFAULTS.costGhs;
  return { priceGhs, costGhs };
}

export async function saveIntlSmsPrices(p: IntlSmsPrices): Promise<void> {
  const value = { priceGhs: p.priceGhs, costGhs: p.costGhs };
  await db.siteContent.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
}

/** How this church buys credits: Ghana credits at its tier, or international credits at the international price. */
export async function resolveSmsPricing(churchId: string): Promise<SmsPricing> {
  const [church, prices, cfg] = await Promise.all([
    db.church.findUnique({ where: { id: churchId }, select: { country: true } }),
    getIntlSmsPrices(),
    db.platformConfig.findUnique({ where: { id: "default" }, select: { usdToGhsRate: true } }),
  ]);
  if (!isGhana(church?.country)) {
    return { kind: "intl", rate: prices.priceGhs, bundles: intlBundles(prices.priceGhs), min: MIN_INTL_CREDITS, max: MAX_INTL_CREDITS, usdRate: cfg?.usdToGhsRate ?? 12 };
  }
  const tier = await resolveSmsTier(churchId);
  return {
    kind: "ghana", tier, rate: SMS_RATE[tier], bundles: bundlesForTier(tier), min: MIN_CUSTOM_CREDITS, max: MAX_CUSTOM_CREDITS,
    foreignPerSegment: foreignCreditsPerSegment(tier, prices.priceGhs), intlPriceGhs: prices.priceGhs,
  };
}

/**
 * What one segment to a number costs this church in credits. `normalised` is digits with country code (233...).
 * A church outside Ghana pays 1 for every number; a Ghana church pays 1 for Ghana and `foreignPerSegment` otherwise.
 */
export type ChargeRule = { ghanaChurch: boolean; foreignPerSegment: number; perSegment: (normalised: string) => number };

export async function chargeRuleForChurch(churchId: string): Promise<ChargeRule> {
  const church = await db.church.findUnique({ where: { id: churchId }, select: { country: true } });
  if (!isGhana(church?.country)) return { ghanaChurch: false, foreignPerSegment: 1, perSegment: () => 1 };
  const [tier, prices] = await Promise.all([resolveSmsTier(churchId), getIntlSmsPrices()]);
  const foreign = foreignCreditsPerSegment(tier, prices.priceGhs);
  return { ghanaChurch: true, foreignPerSegment: foreign, perSegment: (n) => (isGhanaNumber(n) ? 1 : foreign) };
}

/**
 * A church moving into or out of Ghana keeps the same VALUE of credits: 45 Ghana credits (at Standard) buy what 1
 * international credit buys. Done once, when support changes the country, with a line in the credit history.
 * Optimistic: if a send changes the balance at the same moment, it reads again and retries.
 */
export async function convertCreditsForCountryMove(churchId: string, toGhana: boolean): Promise<void> {
  const { convertCreditsForCountry } = await import("@/config/sms");
  const [tier, prices] = await Promise.all([resolveSmsTier(churchId), getIntlSmsPrices()]);
  const per = foreignCreditsPerSegment(tier, prices.priceGhs);
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await db.church.findUnique({ where: { id: churchId }, select: { smsCredits: true } });
    if (!c) return;
    const next = convertCreditsForCountry(c.smsCredits, toGhana, per);
    if (next === c.smsCredits) return;
    const done = await db.church.updateMany({ where: { id: churchId, smsCredits: c.smsCredits }, data: { smsCredits: next } });
    if (done.count === 0) continue;
    await db.smsTransaction.create({
      data: {
        churchId, kind: "convert", credits: next - c.smsCredits, balanceAfter: next,
        note: toGhana
          ? `Moved to Ghana: ${c.smsCredits.toLocaleString()} international credits became ${next.toLocaleString()} credits (1 to ${per})`
          : `Moved outside Ghana: ${c.smsCredits.toLocaleString()} credits became ${next.toLocaleString()} international credits (${per} to 1)`,
      },
    });
    return;
  }
}

/** Free SMS credits for a new church: the usual 30 in Ghana, the same value in international credits elsewhere. */
export async function signupCreditsFor(country: string | null | undefined): Promise<number> {
  const { FREE_SIGNUP_CREDITS, convertCreditsForCountry } = await import("@/config/sms");
  if (isGhana(country)) return FREE_SIGNUP_CREDITS;
  const prices = await getIntlSmsPrices();
  return convertCreditsForCountry(FREE_SIGNUP_CREDITS, false, foreignCreditsPerSegment(null, prices.priceGhs));
}
