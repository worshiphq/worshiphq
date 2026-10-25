/**
 * SMS credit pricing. 1 credit = 1 SMS segment (up to 160 chars) to 1 recipient.
 * Churches buy bundles via Paystack; the platform fulfils sends through its own
 * Hubtel account. The gap between the bundle price and the provider cost is margin.
 *
 * Edit these freely - they're the single source of truth for the buy page.
 */
export interface SmsBundle {
  id: string;
  credits: number;
  priceGhs: number;
  popular?: boolean;
}

/**
 * Pricing tiers the SuperAdmin can switch between. Every tier is a flat price per credit, so any number of credits
 * costs credits x rate, and a bundle is just a handy round number. "D" is the standard price: GH₵100 buys 1,500
 * credits (GH₵0.0667 each). "C" is 10% below standard and "B" 20% below. Provider cost is about GH₵0.03 per credit
 * (see PlatformConfig.smsCostPerCredit).
 */
export type SmsTier = "B" | "C" | "D";
const STANDARD_RATE = 1 / 15;
/** GHS per credit. */
export const SMS_RATE: Record<SmsTier, number> = { B: STANDARD_RATE * 0.8, C: STANDARD_RATE * 0.9, D: STANDARD_RATE };
/** What a credit cost before the October 2026 price cut (GH₵100 bought 1,000). Used to value old top-ups that never recorded what was paid. */
export const LEGACY_SMS_RATE = 0.1;

const round2 = (n: number) => Math.round(n * 100) / 100;
const BUNDLE_CREDITS = [750, 1500, 3000, 7500, 15000, 37500]; // GH₵50, 100, 200, 500, 1,000 and 2,500 at the standard price
const BUNDLE_IDS = ["starter", "plus", "growth", "church", "campus", "cathedral"];

function bundlesAt(rate: number): SmsBundle[] {
  return BUNDLE_CREDITS.map((credits, i) => ({ id: BUNDLE_IDS[i], credits, priceGhs: round2(credits * rate), popular: credits === 1500 }));
}

export const SMS_TIERS: Record<SmsTier, SmsBundle[]> = { B: bundlesAt(SMS_RATE.B), C: bundlesAt(SMS_RATE.C), D: bundlesAt(SMS_RATE.D) };

const per100 = (rate: number) => Math.floor((100 + 1e-9) / rate).toLocaleString("en-GH");
export const SMS_TIER_META: Record<SmsTier, { label: string; note: string }> = {
  B: { label: "Lowest", note: `GH₵100 buys ${per100(SMS_RATE.B)} credits` },
  C: { label: "Reduced", note: `GH₵100 buys ${per100(SMS_RATE.C)} credits` },
  D: { label: "Standard", note: `GH₵100 buys ${per100(SMS_RATE.D)} credits` },
};

/** Smallest and largest custom purchase. */
export const MIN_CUSTOM_CREDITS = 100;
export const MAX_CUSTOM_CREDITS = 200_000;

/** What `credits` cost at a tier. */
export function priceForCredits(credits: number, tier?: string | null): number {
  return round2(Math.max(0, Math.floor(credits)) * SMS_RATE[isSmsTier(tier) ? tier : DEFAULT_SMS_TIER]);
}

/** How many credits `amountGhs` buys at a tier (rounded down, so the church never pays for a part-credit). */
export function creditsForAmount(amountGhs: number, tier?: string | null): number {
  const rate = SMS_RATE[isSmsTier(tier) ? tier : DEFAULT_SMS_TIER];
  return Math.max(0, Math.floor((amountGhs + 1e-9) / rate));
}

export const DEFAULT_SMS_TIER: SmsTier = "D";

export function isSmsTier(v: unknown): v is SmsTier {
  return v === "B" || v === "C" || v === "D";
}

/** The bundle list for a tier (defaults to D). */
export function bundlesForTier(tier?: string | null): SmsBundle[] {
  return SMS_TIERS[isSmsTier(tier) ? tier : DEFAULT_SMS_TIER];
}

/** Back-compat: the default tier's bundles. */
export const SMS_BUNDLES: SmsBundle[] = SMS_TIERS[DEFAULT_SMS_TIER];

export function getBundle(id: string, tier?: string | null): SmsBundle | undefined {
  return bundlesForTier(tier).find((b) => b.id === id);
}

/** Free credits granted to a new church on signup (mirror of the DB default). */
export const FREE_SIGNUP_CREDITS = 50;

/** Characters per SMS segment (standard GSM). */
export const SMS_SEGMENT_CHARS = 160;

// The GSM 7-bit alphabet. Any character outside it makes the whole message Unicode (UCS-2),
// which fits 70 characters per part instead of 160. The extension characters count as two.
const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";

/**
 * Swap the typographic punctuation phone keyboards insert (curly quotes, long dashes, ellipsis)
 * for plain ones, so an ordinary message doesn't turn into a 70-character Unicode SMS.
 */
export function smsNormalize(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");
}

/** Credits one message costs to one recipient (longer messages = more segments). */
export function segmentsFor(message: string): number {
  const text = smsNormalize(message);
  let units = 0;
  let gsm = true;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) units += 1;
    else if (GSM_EXTENDED.includes(ch)) units += 2;
    else { gsm = false; break; }
  }
  if (gsm) return units <= 160 ? 1 : Math.ceil(units / 153);
  // Unicode: UTF-16 code units (an emoji is two), 70 per single part, 67 per part when joined.
  const len = text.length;
  return len <= 70 ? 1 : Math.ceil(len / 67);
}
