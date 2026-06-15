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

export const SMS_BUNDLES: SmsBundle[] = [
  { id: "starter", credits: 500, priceGhs: 30 },
  { id: "growth", credits: 2000, priceGhs: 100, popular: true },
  { id: "church", credits: 5000, priceGhs: 220 },
  { id: "campus", credits: 10000, priceGhs: 400 },
];

export function getBundle(id: string): SmsBundle | undefined {
  return SMS_BUNDLES.find((b) => b.id === id);
}

/** Free credits granted to a new church on signup (mirror of the DB default). */
export const FREE_SIGNUP_CREDITS = 50;

/** Characters per SMS segment (standard GSM). */
export const SMS_SEGMENT_CHARS = 160;

/** Credits one message costs to one recipient (longer messages = more segments). */
export function segmentsFor(message: string): number {
  return Math.max(1, Math.ceil(message.length / SMS_SEGMENT_CHARS));
}
