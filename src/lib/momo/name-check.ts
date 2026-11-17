import { MOMO_NETWORKS, MOMO_NETWORK_IDS, type MomoNetworkId } from "@/lib/momo/networks";

/**
 * The Mobile Money NAME CHECK, pure parts (no network, no database), shared by the server lookup and the tests.
 *
 * Before charging, the server asks Paystack who owns the number (GET /bank/resolve with the network's bank code).
 * The network the payer chose is tried first, then the one the prefix suggests, then the rest, so a wrong pick or a
 * ported number is caught before a prompt is sent to a phone that will never see it.
 */

export type BankCodes = Record<MomoNetworkId, string>;

/** Bank codes when Paystack's list can't be read. */
export const FALLBACK_BANK_CODES: BankCodes = Object.fromEntries(
  MOMO_NETWORK_IDS.map((id) => [id, MOMO_NETWORKS[id].bankCode]),
) as BankCodes;

type BankRow = { name?: unknown; code?: unknown; slug?: unknown; type?: unknown; currency?: unknown; active?: unknown; is_deleted?: unknown };

/** Which of our networks a row of Paystack's bank list is, from its code first, then its name or slug. */
export function networkForBankRow(row: BankRow): MomoNetworkId | null {
  const code = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
  const text = `${typeof row.name === "string" ? row.name : ""} ${typeof row.slug === "string" ? row.slug : ""}`.toLowerCase();
  if (code === "MTN" || /\bmtn\b/.test(text)) return "mtn";
  if (code === "VOD" || /vodafone|telecel/.test(text)) return "telecel";
  if (code === "ATL" || code === "TGO" || /airtel|tigo|\bat\b|at money/.test(text)) return "at";
  return null;
}

/**
 * Our network ids to the bank codes in Paystack's GET /bank?currency=GHS&type=mobile_money reply. Anything the list
 * doesn't name (or a reply we can't read) keeps the fallback code, so the result always has all three.
 */
export function bankCodesFromList(json: unknown): BankCodes {
  const out: BankCodes = { ...FALLBACK_BANK_CODES };
  const data = json && typeof json === "object" ? (json as { data?: unknown }).data : null;
  if (!Array.isArray(data)) return out;
  const seen = new Set<MomoNetworkId>();
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as BankRow;
    if (row.is_deleted === true || row.active === false) continue;
    if (typeof row.type === "string" && row.type && row.type !== "mobile_money") continue;
    if (typeof row.currency === "string" && row.currency && row.currency.toUpperCase() !== "GHS") continue;
    const id = networkForBankRow(row);
    const code = typeof row.code === "string" ? row.code.trim() : "";
    // The first match wins, so a stray second row (an old AirtelTigo code, say) can't replace the main one.
    if (id && code && !seen.has(id)) { out[id] = code; seen.add(id); }
  }
  return out;
}

/** The order to try networks in: the chosen one, then the prefix's, then the rest. Never repeats one. */
export function resolveOrder(chosen: MomoNetworkId | null, detected: MomoNetworkId | null): MomoNetworkId[] {
  const out: MomoNetworkId[] = [];
  for (const id of [chosen, detected, ...MOMO_NETWORK_IDS]) if (id && !out.includes(id)) out.push(id);
  return out;
}

/** One resolve attempt: found a name, the network said no such account, or we couldn't ask. */
export type ResolveAttempt = { kind: "found"; name: string } | { kind: "not_found" } | { kind: "unavailable" };

/** Read a GET /bank/resolve reply. `httpOk` is the HTTP status being 2xx; a 5xx/429 means "couldn't ask". */
export function readResolveReply(httpStatus: number, json: unknown): ResolveAttempt {
  const top = (json && typeof json === "object" ? json : {}) as { status?: unknown; data?: unknown };
  const data = (top.data && typeof top.data === "object" ? top.data : {}) as { account_name?: unknown };
  const name = typeof data.account_name === "string" ? data.account_name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (httpStatus >= 200 && httpStatus < 300 && top.status === true && name) return { kind: "found", name };
  // Paystack answers 400/422 "Could not resolve account name" for an account the bank (here, the network) doesn't know.
  if (httpStatus === 400 || httpStatus === 404 || httpStatus === 422) return { kind: "not_found" };
  return { kind: "unavailable" };
}

export type NameCheckResult =
  | { status: "found"; name: string; network: MomoNetworkId; switched: boolean; chosen: MomoNetworkId | null }
  | { status: "not_found" }
  | { status: "unavailable" };

/**
 * Try each network in turn until one knows the number. A network that couldn't be asked doesn't count as "not
 * found": if none found it and any couldn't be asked, the answer is "unavailable" (let the payer go on).
 */
export async function resolveAcrossNetworks(
  chosen: MomoNetworkId | null,
  detected: MomoNetworkId | null,
  tryOne: (network: MomoNetworkId) => Promise<ResolveAttempt>,
): Promise<NameCheckResult> {
  let unavailable = false;
  for (const id of resolveOrder(chosen, detected)) {
    let r: ResolveAttempt;
    try {
      r = await tryOne(id);
    } catch {
      r = { kind: "unavailable" };
    }
    if (r.kind === "found") return { status: "found", name: r.name, network: id, switched: !!chosen && chosen !== id, chosen };
    if (r.kind === "unavailable") {
      unavailable = true;
      // If the network the payer chose can't be asked, the others probably can't either: stop early.
      if (id === chosen) break;
    }
  }
  return unavailable ? { status: "unavailable" } : { status: "not_found" };
}

/* ── Why a charge failed, in plain words ── */

export type FailureExplanation = { text: string; wrongNetwork: boolean };

const WRONG_NETWORK_RE =
  /invalid (mobile|momo|phone|number|account|msisdn|wallet|provider)|not (a )?(registered|valid|found|subscribed)|unregistered|no (such )?(account|wallet|subscriber)|(account|wallet|subscriber|msisdn) (not found|does not exist|doesn'?t exist)|could not resolve|unknown (number|subscriber|account)|wrong (network|provider)|(network|provider) mismatch/i;

/**
 * Paystack's gateway_response / message for a failed Mobile Money charge, turned into words a payer understands.
 * When it looks like the number isn't on the chosen network, say so and set `wrongNetwork`.
 */
export function explainMomoFailure(raw: string | null | undefined, networkLabel?: string | null): FailureExplanation {
  const m = String(raw ?? "").trim();
  const net = networkLabel || "this network";
  if (/\bpin\b/i.test(m)) return { text: "The MoMo PIN was not accepted. Try again and enter the right PIN.", wrongNetwork: false };
  if (/insufficient|not enough|low balance|balance (is )?(too )?low/i.test(m)) {
    return { text: "There isn't enough money in this Mobile Money wallet. Top up and try again.", wrongNetwork: false };
  }
  if (WRONG_NETWORK_RE.test(m)) return { text: `This number may not be on ${net}. Check the network and try again.`, wrongNetwork: true };
  if (/time ?out|timed out|expired|no response|not approved|abandon|did not respond/i.test(m)) {
    return { text: "The prompt on your phone wasn't approved in time. Try again and approve it when it pops up.", wrongNetwork: false };
  }
  if (/declin|reject|cancel|refused|denied/i.test(m)) {
    return { text: "The payment was declined on the phone. If you meant to pay, try again and approve the prompt.", wrongNetwork: false };
  }
  if (/limit|exceed/i.test(m)) {
    return { text: "This payment is over the wallet's Mobile Money limit. Try a smaller amount or another number.", wrongNetwork: false };
  }
  if (/not allowed|not permitted|blocked|suspend|frozen|inactive|barred/i.test(m)) {
    return { text: "This Mobile Money wallet can't make payments right now. Contact your network or use another number.", wrongNetwork: false };
  }
  if (!m || /^(declined|failed|charge failed|transaction failed|error)\.?$/i.test(m)) return { text: "Please try again.", wrongNetwork: false };
  return { text: `Your network said: "${m.slice(0, 160).replace(/\.$/, "")}". Please try again.`, wrongNetwork: false };
}
