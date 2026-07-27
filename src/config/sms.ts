/**
 * SMS credit pricing. 1 credit = 1 SMS segment (up to 160 chars) to 1 recipient.
 * Churches buy bundles via Paystack; the platform fulfils sends through its own
 * Hubtel account. The gap between the bundle price and the provider cost is margin.
 *
 * Edit these freely — they're the single source of truth for the buy page.
 */
export interface SmsBundle {
  id: string;
  credits: number;
  priceGhs: number;
  popular?: boolean;
}

/** Pricing tiers the SuperAdmin can switch between (per-SMS profit rises B→D).
 *  Provider cost is ~₵0.03–0.04/SMS, so every tier here stays comfortably
 *  profitable. "D" is the site default. */
export type SmsTier = "B" | "C" | "D";
export const SMS_TIERS: Record<SmsTier, SmsBundle[]> = {
  // Balanced — ~2.5–3× cost
  B: [
    { id: "starter", credits: 500, priceGhs: 65 },
    { id: "growth", credits: 2000, priceGhs: 240, popular: true },
    { id: "church", credits: 5000, priceGhs: 550 },
    { id: "campus", credits: 10000, priceGhs: 1000 },
  ],
  // Premium — ~3–4× cost
  C: [
    { id: "starter", credits: 500, priceGhs: 80 },
    { id: "growth", credits: 2000, priceGhs: 300, popular: true },
    { id: "church", credits: 5000, priceGhs: 700 },
    { id: "campus", credits: 10000, priceGhs: 1250 },
  ],
  // Top-tier — ~4–5× cost (default)
  D: [
    { id: "starter", credits: 500, priceGhs: 100 },
    { id: "growth", credits: 2000, priceGhs: 360, popular: true },
    { id: "church", credits: 5000, priceGhs: 800 },
    { id: "campus", credits: 10000, priceGhs: 1500 },
  ],
};

export const SMS_TIER_META: Record<SmsTier, { label: string; note: string }> = {
  B: { label: "Balanced", note: "Lowest prices · ~2.5–3× cost" },
  C: { label: "Premium", note: "Higher margin · ~3–4× cost" },
  D: { label: "Top-tier", note: "Highest margin · ~4–5× cost" },
};

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
