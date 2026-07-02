// Mirror of web src/config/sms.ts — single source of truth for the desktop buy page.
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

export const SMS_SEGMENT_CHARS = 160;

export function segmentsFor(message: string): number {
  return Math.max(1, Math.ceil(message.length / SMS_SEGMENT_CHARS));
}
