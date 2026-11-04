import "server-only";
import { db } from "@/lib/db";
import { ttlCached } from "@/lib/ttl-cache";
import { getNaloCostPerCredit } from "@/lib/data/sms-stock";

/** What each carrier charges WorshipHQ per SMS segment, in cedis. Read once a minute, not on every text. */
export type SmsRates = { hubtel: number; nalo: number };

export function getSmsRates(): Promise<SmsRates> {
  return ttlCached("sms-rates", 60_000, async () => {
    const cfg = await db.platformConfig.findUnique({ where: { id: "default" }, select: { smsCostPerCredit: true } }).catch(() => null);
    return { hubtel: cfg?.smsCostPerCredit ?? 0.03, nalo: await getNaloCostPerCredit() };
  });
}

/** Any carrier that is not Nalo is priced like Hubtel: they are the only two in real use. */
export const rateFor = (rates: SmsRates, provider: string): number => (provider === "nalo" ? rates.nalo : rates.hubtel);
