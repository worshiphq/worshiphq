import { normalisePhone } from "@/lib/phone";

/**
 * Ghana's Mobile Money networks, shared by the payment sheet (client) and the charge code (server).
 * `paystack` is the provider code sent to Paystack's /charge. Older Paystack docs call AirtelTigo "tgo";
 * current ones say "atl". Change it here only, if Paystack ever refuses it.
 */
export const MOMO_NETWORKS = {
  mtn: { id: "mtn", label: "MTN MoMo", short: "MTN", paystack: "mtn", chipBg: "#FFCC00", chipFg: "#000000", prefixes: ["024", "054", "055", "059", "025", "053"] },
  telecel: { id: "telecel", label: "Telecel Cash", short: "T", paystack: "vod", chipBg: "#E60000", chipFg: "#FFFFFF", prefixes: ["020", "050"] },
  at: { id: "at", label: "AT Money (AirtelTigo)", short: "AT", paystack: "atl", chipBg: "#004F9F", chipFg: "#FFFFFF", prefixes: ["026", "056", "027", "057"] },
} as const;

export type MomoNetworkId = keyof typeof MOMO_NETWORKS;
export const MOMO_NETWORK_IDS = Object.keys(MOMO_NETWORKS) as MomoNetworkId[];

export function isMomoNetworkId(v: unknown): v is MomoNetworkId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(MOMO_NETWORKS, v);
}

/**
 * A Ghana mobile number in the local 0XXXXXXXXX form Paystack expects, or null. Accepts "024 123 4567",
 * "+233 24 123 4567", "233241234567", "0241234567" and "241234567". Mobile numbers have 2 or 5 as their
 * second digit (02x, 05x); anything else (a landline, a foreign number) is refused.
 */
export function toLocalGhanaMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const intl = normalisePhone(String(raw));
  if (!/^233\d{9}$/.test(intl)) return null;
  const local = "0" + intl.slice(3);
  return /^0[25]\d{8}$/.test(local) ? local : null;
}

export function isValidGhanaMobile(raw: string | null | undefined): boolean {
  return toLocalGhanaMobile(raw) !== null;
}

/**
 * The network a number usually belongs to, from its prefix. Only a suggestion: people keep their number when they
 * move networks, so the network the payer taps always wins.
 */
export function detectNetwork(raw: string | null | undefined): MomoNetworkId | null {
  const local = toLocalGhanaMobile(raw);
  if (!local) return null;
  const prefix = local.slice(0, 3);
  for (const id of MOMO_NETWORK_IDS) {
    if ((MOMO_NETWORKS[id].prefixes as readonly string[]).includes(prefix)) return id;
  }
  return null;
}
