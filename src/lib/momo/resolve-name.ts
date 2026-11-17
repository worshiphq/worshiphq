import "server-only";
import crypto from "node:crypto";
import { env, features } from "@/lib/env";
import { ttlCached } from "@/lib/ttl-cache";
import { detectNetwork, type MomoNetworkId } from "@/lib/momo/networks";
import {
  bankCodesFromList, resolveAcrossNetworks, readResolveReply, FALLBACK_BANK_CODES,
  type BankCodes, type NameCheckResult, type ResolveAttempt,
} from "@/lib/momo/name-check";

/**
 * The Mobile Money name check against Paystack (server only). Never logs the full number: logs and cache keys use a
 * short hash.
 *
 * NOTE: Paystack documents GET /bank/resolve as available in Ghana, but its docs only show bank (ghipss) examples.
 * Whether it resolves mobile money numbers with the MTN / VOD / ATL bank codes has to be confirmed against the live
 * API. Every failure here comes back as "unavailable", and the sheet then lets the payer go on with their choice.
 */

const API = "https://api.paystack.co";
const TIMEOUT_MS = 8_000;
const BANK_LIST_TTL_MS = 6 * 60 * 60_000;
const FOUND_TTL_MS = 10 * 60_000;

/** A short, one-way tag for a phone number (rate-limit keys, cache keys, logs). */
export function phoneTag(phone: string): string {
  return crypto.createHash("sha256").update(`momo-name:${phone}`).digest("hex").slice(0, 16);
}

async function get(path: string): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

/** Ghana mobile money bank codes from Paystack, cached for 6 hours; the fallback map when the list can't be read. */
export async function getMomoBankCodes(): Promise<BankCodes> {
  if (!features.payments) return FALLBACK_BANK_CODES;
  try {
    return await ttlCached("momo:bank-codes", BANK_LIST_TTL_MS, async () => {
      const { status, json } = await get("/bank?currency=GHS&type=mobile_money");
      if (status < 200 || status >= 300) throw new Error(`bank list ${status}`);
      return bankCodesFromList(json);
    });
  } catch (e) {
    console.warn("[momo:name] bank list unavailable, using fallback codes:", (e as Error).message);
    return FALLBACK_BANK_CODES;
  }
}

async function resolveOne(phone: string, bankCode: string): Promise<ResolveAttempt> {
  try {
    const q = new URLSearchParams({ account_number: phone, bank_code: bankCode });
    const { status, json } = await get(`/bank/resolve?${q.toString()}`);
    return readResolveReply(status, json);
  } catch {
    return { kind: "unavailable" };
  }
}

/**
 * Who owns this Mobile Money number, and on which network. `phone` must already be local (toLocalGhanaMobile).
 * Only a found name is cached (10 minutes), so a payer who just fixed their number is never served an old "no".
 */
export async function lookupMomoName(phone: string, chosen: MomoNetworkId | null): Promise<NameCheckResult> {
  // Stub mode (no Paystack key): nothing to ask; the sheet goes on with the chosen network.
  if (!features.payments) return { status: "unavailable" };
  const tag = phoneTag(phone);
  const run = async () => {
    const codes = await getMomoBankCodes();
    const r = await resolveAcrossNetworks(chosen, detectNetwork(phone), (id) => resolveOne(phone, codes[id]));
    if (r.status !== "found") throw Object.assign(new Error("not found"), { result: r });
    return r;
  };
  try {
    // Keyed by number only: the owner and network don't depend on which network the payer tapped.
    const found = await ttlCached(`momo:name:${tag}`, FOUND_TTL_MS, run);
    return { ...found, switched: !!chosen && chosen !== found.network, chosen };
  } catch (e) {
    const r = (e as { result?: NameCheckResult }).result;
    if (r) return r;
    console.warn(`[momo:name] lookup ${tag} failed:`, (e as Error).message);
    return { status: "unavailable" };
  }
}
