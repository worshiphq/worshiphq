import crypto from "node:crypto";
import { authSecret, safeEqual } from "@/lib/auth/tokens";

/**
 * Seals the metadata we attach to a Paystack checkout. The seal is an HMAC over the reference,
 * the exact amount and currency, and every metadata field we set, keyed with our own secret.
 *
 * Paystack's public key is public, so anyone can start a charge on our account with metadata of
 * their own choosing. Without a valid seal for that reference and amount, such a charge can never
 * grant credits, a plan or a gift bigger than what was really paid.
 */

const canon = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

function computeSeal(reference: string, subunits: number, currency: string, keys: string[], meta: Record<string, unknown>) {
  const fields = keys.map((k) => `${k}=${canon(meta[k])}`).join("&");
  return crypto
    .createHmac("sha256", authSecret())
    .update(`checkout|${reference}|${Math.round(subunits)}|${currency.toUpperCase()}|${fields}`)
    .digest("base64url");
}

/** Metadata plus `sk` (the sealed field names) and `seal`. */
export function sealMetadata(reference: string, subunits: number, currency: string, meta: Record<string, unknown>) {
  const keys = Object.keys(meta).filter((k) => k !== "seal" && k !== "sk").sort();
  return { ...meta, sk: keys.join(","), seal: computeSeal(reference, subunits, currency, keys, meta) };
}

export interface PaystackTxn {
  reference?: string;
  amount?: number;
  currency?: string;
  status?: string;
  metadata?: unknown;
  customer?: { email?: string; phone?: string };
}

/** Parse Paystack's metadata (it can arrive as an object or a JSON string). */
export function rawMetadata(txn: PaystackTxn): Record<string, unknown> {
  let meta = txn.metadata;
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = {};
    }
  }
  return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
}

/**
 * The sealed metadata fields when the seal matches this transaction's reference, amount and
 * currency; null for anything unsealed or tampered with.
 */
export function openSealedMetadata(txn: PaystackTxn): Record<string, unknown> | null {
  const meta = rawMetadata(txn);
  if (typeof meta.seal !== "string" || typeof meta.sk !== "string" || !txn.reference) return null;
  const keys = meta.sk.split(",").filter(Boolean);
  const expected = computeSeal(String(txn.reference), Number(txn.amount ?? 0), String(txn.currency ?? ""), keys, meta);
  if (!safeEqual(meta.seal, expected)) return null;
  return Object.fromEntries(keys.map((k) => [k, meta[k]]));
}
