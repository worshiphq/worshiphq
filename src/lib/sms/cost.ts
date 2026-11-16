import "server-only";
import { db } from "@/lib/db";
import { ttlCached } from "@/lib/ttl-cache";
import { getNaloCostPerCredit } from "@/lib/data/sms-stock";
import { getIntlSmsPrices } from "@/lib/sms/intl";

/** What each carrier charges WorshipHQ per SMS segment, in cedis. Read once a minute, not on every text. */
/** `intl` is what one segment to a number outside Ghana costs (Nalo's flat international price). */
export type SmsRates = { hubtel: number; nalo: number; intl: number };

export function getSmsRates(): Promise<SmsRates> {
  return ttlCached("sms-rates", 60_000, async () => {
    const cfg = await db.platformConfig.findUnique({ where: { id: "default" }, select: { smsCostPerCredit: true } }).catch(() => null);
    return { hubtel: cfg?.smsCostPerCredit ?? 0.03, nalo: await getNaloCostPerCredit(), intl: (await getIntlSmsPrices()).costGhs };
  });
}

/** Any carrier that is not Nalo is priced like Hubtel: they are the only two in real use. */
export const rateFor = (rates: SmsRates, provider: string): number => (provider === "nalo" ? rates.nalo : rates.hubtel);
