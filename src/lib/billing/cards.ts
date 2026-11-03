import "server-only";
import { db } from "@/lib/db";
import { seal, open } from "@/lib/crypto-box";
import type { PaystackTxn } from "@/lib/billing/checkout-seal";

/**
 * Saved cards, for automatic renewal.
 *
 * Only a Paystack CARD payment can be kept. Mobile Money has to be approved on the phone every time, so
 * Paystack never marks it reusable, and Hubtel does not hand back anything we can charge again. A church
 * paying by MoMo or Hubtel is reminded and renews by hand; that is a limit of those methods, not a choice.
 */

/** What a church (or a browser) may see of a card. The charge token is deliberately not in here. */
export type CardView = { id: string; brand: string | null; last4: string; expMonth: string | null; expYear: string | null; bank: string | null };

export type SaveCardResult =
  | { ok: true; cardId: string; created: boolean }
  | { ok: false; reason: "not_reusable" | "not_card" | "missing" };

/**
 * Keep the card a payment was made with. The same physical card is only ever stored once per church
 * (Paystack's `signature` is a fingerprint of the card), and saving it again refreshes its token and expiry.
 */
export async function saveCardFromTxn(churchId: string, txn: PaystackTxn): Promise<SaveCardResult> {
  const a = txn.authorization;
  if (!a?.authorization_code || !a.signature || !a.last4) return { ok: false, reason: "missing" };
  if (a.channel && a.channel !== "card") return { ok: false, reason: "not_card" };
  // Paystack says whether the token can be charged again. If it says no, we must not pretend it can.
  if (a.reusable !== true) return { ok: false, reason: "not_reusable" };
  const email = txn.customer?.email;
  if (!email) return { ok: false, reason: "missing" };

  const data = {
    authCode: seal(a.authorization_code),
    email,
    brand: a.brand ?? a.card_type ?? null,
    last4: a.last4,
    expMonth: a.exp_month ?? null,
    expYear: a.exp_year ?? null,
    bank: a.bank ?? null,
  };
  const existing = await db.savedCard.findUnique({ where: { churchId_signature: { churchId, signature: a.signature } }, select: { id: true } });
  if (existing) {
    await db.savedCard.update({ where: { id: existing.id }, data });
    return { ok: true, cardId: existing.id, created: false };
  }
  const row = await db.savedCard.create({ data: { churchId, signature: a.signature, ...data }, select: { id: true } });
  return { ok: true, cardId: row.id, created: true };
}

/** A church's saved cards, safe to send to the browser. */
export async function listCards(churchId: string): Promise<CardView[]> {
  return db.savedCard.findMany({
    where: { churchId },
    orderBy: { createdAt: "desc" },
    select: { id: true, brand: true, last4: true, expMonth: true, expYear: true, bank: true },
  });
}

/** Server-only: the card with its charge token opened. Null if it is gone or its token can no longer be read. */
export async function getChargeableCard(churchId: string, cardId: string) {
  const row = await db.savedCard.findFirst({ where: { id: cardId, churchId } });
  if (!row) return null;
  const authCode = open(row.authCode);
  if (!authCode) return null;
  return { id: row.id, authCode, email: row.email, last4: row.last4, expMonth: row.expMonth, expYear: row.expYear };
}

/** Has this card's expiry date passed? An expired card is not charged: it would only fail and count against the church. */
export function cardExpired(c: { expMonth: string | null; expYear: string | null }, now = new Date()): boolean {
  const m = Number(c.expMonth);
  let y = Number(c.expYear);
  if (!m || !y) return false; // unknown expiry: let Paystack decide
  if (y < 100) y += 2000;
  // A card is good through the LAST day of its expiry month.
  return new Date(y, m, 1).getTime() <= now.getTime();
}
