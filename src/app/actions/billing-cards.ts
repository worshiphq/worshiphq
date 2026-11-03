"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { rawMetadata, openSealedMetadata, type PaystackTxn } from "@/lib/billing/checkout-seal";
import { saveCardFromTxn } from "@/lib/billing/cards";
import { logBillingEvent } from "@/lib/billing/events";
import { autoRenewEnabled } from "@/lib/billing/auto-renew";

/**
 * Saved cards and automatic renewal, from the church's side.
 *
 * Every action here is the Main Admin's alone and says so itself: the audit that preceded this found the
 * house habit was to guard the page and leave the actions open, and these move money, so each is guarded
 * individually even though it looks repetitive. Nothing here ever returns the charge token.
 */

async function ownerSession() {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner") throw new Error("Only the Main Admin can manage cards and automatic renewal.");
  if (session.impersonating) throw new Error("Support sessions cannot change payment methods.");
  return session;
}

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

/**
 * Keep the card a payment was made with. The reference must be one of THIS church's own plan payments
 * (checked against the charge's sealed metadata, not against anything the browser sent), and the payment
 * must really have been a card Paystack says can be charged again.
 */
export async function saveCardFromPayment(reference: string): Promise<Result> {
  const session = await ownerSession();
  if (!reference || !/^[A-Za-z0-9_.=-]{6,100}$/.test(reference)) return fail("That payment reference is not valid.");
  if (!env.PAYSTACK_SECRET_KEY) return fail("Payments are not configured.");

  let txn: PaystackTxn | undefined;
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
    });
    txn = (await res.json())?.data;
  } catch {
    return fail("Could not reach Paystack. Please try again.");
  }
  if (!txn || txn.status !== "success") return fail("That payment was not completed.");

  // It must be a plan payment made BY this church. Sealed metadata is what we trust; a payment with no
  // valid seal falls back to the recorded payment row for the same reference.
  const sealed = openSealedMetadata(txn);
  const claimed = String((sealed ?? rawMetadata(txn)).churchId ?? "");
  const recorded = await db.planPayment.findFirst({ where: { reference, churchId: session.churchId }, select: { id: true } });
  if (claimed !== session.churchId && !recorded) return fail("That payment does not belong to your church.");

  const saved = await saveCardFromTxn(session.churchId, txn);
  if (!saved.ok) {
    return fail(
      saved.reason === "not_card"
        ? "That payment was made with Mobile Money, which has to be approved on your phone each time, so it cannot be saved. Pay once by card to keep a card."
        : saved.reason === "not_reusable"
          ? "Your bank does not allow this card to be kept for automatic payments."
          : "We could not read the card details from that payment.",
    );
  }

  // The first card kept becomes the renewal card. A later one never silently replaces it.
  const sub = await db.subscription.findUnique({ where: { churchId: session.churchId }, select: { cardId: true } });
  if (!sub?.cardId) await db.subscription.update({ where: { churchId: session.churchId }, data: { cardId: saved.cardId } });
  await logBillingEvent(session.churchId, { kind: "card_saved", title: saved.created ? "Card saved" : "Card refreshed", detail: txn.authorization?.last4 ? `Card ending ${txn.authorization.last4}` : undefined });
  revalidatePath("/app/settings");
  return { ok: true, message: saved.created ? "Card saved." : "That card was already saved. It has been refreshed." };
}

/** Remove a saved card. If it was the renewal card, automatic renewal is switched off with it. */
export async function removeSavedCard(cardId: string): Promise<Result> {
  const session = await ownerSession();
  const card = await db.savedCard.findFirst({ where: { id: cardId, churchId: session.churchId }, select: { id: true, last4: true } });
  if (!card) return fail("That card was not found.");

  await db.savedCard.delete({ where: { id: card.id } });
  const sub = await db.subscription.findUnique({ where: { churchId: session.churchId }, select: { cardId: true, autoRenew: true } });
  let detail = `Card ending ${card.last4}`;
  if (sub?.cardId === card.id) {
    // Fall back to another saved card if there is one; otherwise there is nothing to charge, so it goes off.
    const next = await db.savedCard.findFirst({ where: { churchId: session.churchId }, orderBy: { createdAt: "desc" }, select: { id: true } });
    await db.subscription.update({
      where: { churchId: session.churchId },
      data: next ? { cardId: next.id } : { cardId: null, autoRenew: false },
    });
    if (!next && sub.autoRenew) detail += ". Automatic renewal was switched off with it";
  }
  await logBillingEvent(session.churchId, { kind: "card_removed", title: "Card removed", detail });
  revalidatePath("/app/settings");
  return { ok: true };
}

/** Choose which saved card is charged. */
export async function setRenewalCard(cardId: string): Promise<Result> {
  const session = await ownerSession();
  const card = await db.savedCard.findFirst({ where: { id: cardId, churchId: session.churchId }, select: { id: true } });
  if (!card) return fail("That card was not found.");
  await db.subscription.update({ where: { churchId: session.churchId }, data: { cardId: card.id, renewalFailures: 0 } });
  revalidatePath("/app/settings");
  return { ok: true };
}

/** Switch automatic renewal on or off. On needs a saved card and a paid, non-gifted plan. */
export async function setAutoRenewal(on: boolean): Promise<Result> {
  const session = await ownerSession();
  const sub = await db.subscription.findUnique({ where: { churchId: session.churchId } });
  if (!sub) return fail("No subscription found.");

  if (!on) {
    await db.subscription.update({ where: { churchId: session.churchId }, data: { autoRenew: false } });
    await logBillingEvent(session.churchId, { kind: "auto_renew_off", title: "Automatic renewal turned off" });
    revalidatePath("/app/settings");
    return { ok: true, message: "Automatic renewal is off. We will remind you before each renewal instead." };
  }

  if (sub.status === "grace") return fail("Your plan is a gift, so there is nothing to renew.");
  if (sub.plan === "free") return fail("There is nothing to renew on the Free plan.");
  if (!autoRenewEnabled()) return fail("Automatic renewal is not available right now. Please renew by hand.");

  const card = sub.cardId
    ? await db.savedCard.findFirst({ where: { id: sub.cardId, churchId: session.churchId }, select: { id: true } })
    : await db.savedCard.findFirst({ where: { churchId: session.churchId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!card) return fail("Save a card first. Pay once by card and tick \"keep my card\", or save it from a recent payment below.");

  await db.subscription.update({ where: { churchId: session.churchId }, data: { autoRenew: true, cardId: card.id, renewalFailures: 0 } });
  await logBillingEvent(session.churchId, { kind: "auto_renew_on", title: "Automatic renewal turned on" });
  revalidatePath("/app/settings");
  return { ok: true, message: "Automatic renewal is on. You will get a heads-up three days before each charge." };
}
