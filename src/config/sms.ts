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
 * costs credits x rate, and a bundle is just a handy round number. "D" (GH₵0.10 per credit, 500 credits for
 * GH₵50) is the standard price. Provider cost is about GH₵0.03 per credit (see PlatformConfig.smsCostPerCredit).
 */
export type SmsTier = "B" | "C" | "D";
/** GHS per credit. */
export const SMS_RATE: Record<SmsTier, number> = { B: 0.08, C: 0.09, D: 0.1 };

const round2 = (n: number) => Math.round(n * 100) / 100;
const BUNDLE_CREDITS = [500, 2000, 5000, 10000, 25000];
const BUNDLE_IDS = ["starter", "growth", "church", "campus", "cathedral"];

function bundlesAt(rate: number): SmsBundle[] {
  return BUNDLE_CREDITS.map((credits, i) => ({ id: BUNDLE_IDS[i], credits, priceGhs: round2(credits * rate), popular: credits === 2000 }));
}

export const SMS_TIERS: Record<SmsTier, SmsBundle[]> = { B: bundlesAt(SMS_RATE.B), C: bundlesAt(SMS_RATE.C), D: bundlesAt(SMS_RATE.D) };

export const SMS_TIER_META: Record<SmsTier, { label: string; note: string }> = {
  B: { label: "Lowest", note: `GH₵${SMS_RATE.B.toFixed(2)} per credit` },
  C: { label: "Reduced", note: `GH₵${SMS_RATE.C.toFixed(2)} per credit` },
  D: { label: "Standard", note: `GH₵${SMS_RATE.D.toFixed(2)} per credit (500 credits for GH₵50)` },
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

/** Credits one message costs to one recipient (longer messages = more segments). */
export function segmentsFor(message: string): number {
  return Math.max(1, Math.ceil(message.length / SMS_SEGMENT_CHARS));
}
