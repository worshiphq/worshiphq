import "server-only";
import { db } from "@/lib/db";
import { env, features } from "@/lib/env";
import { SETTLEMENT_CURRENCY } from "@/lib/integrations/paystack";
import { sealMetadata, type PaystackTxn } from "@/lib/billing/checkout-seal";
import { activatePlanPayment } from "@/lib/billing/activate-plan";
import { getChargeableCard, cardExpired } from "@/lib/billing/cards";

/**
 * Charging a church's saved card on its renewal date.
 *
 * This moves real money without the church present, so it is built to fail safe rather than fail loud:
 *
 *  - OFF SWITCH. Set AUTO_RENEW_DISABLED=1 in Vercel and no card is charged by anything here.
 *  - ONLY FOR A CHURCH THAT OPTED IN. Nothing is charged unless `autoRenew` is on, which only the
 *    Main Admin can switch on, and only with a card they chose to keep.
 *  - NEVER TWICE. Each attempt first takes a lock (`lastRenewalAttemptAt`, claimed with a conditional
 *    update so two cron runs cannot both win), and uses a reference that is fixed for the period and the
 *    attempt number, which Paystack refuses to accept twice.
 *  - VERIFY BEFORE RETRY. A charge that came back "pending" is looked up by its reference on the next run
 *    instead of being charged again.
 *  - THE SAME GATE AS A MANUAL PAYMENT. A successful charge goes through activatePlanPayment, with a
 *    sealed checkout built here on the server, so it is recorded, receipted and de-duplicated exactly like
 *    one the church paid by hand (and the Paystack webhook, which also fires, is harmless).
 */

const MAX_FAILURES = 3;
const RETRY_AFTER_MS = 20 * 3600_000;

export const autoRenewEnabled = () => features.payments && process.env.AUTO_RENEW_DISABLED !== "1";

export type ChargeOutcome =
  | { status: "renewed"; amountGhs: number; plan: string; interval: string; renewsAt: Date | null }
  | { status: "pending" }
  | { status: "failed"; reason: string; failures: number; giveUp: boolean }
  | { status: "skipped"; reason: string };

const attemptRef = (churchId: string, renewsAt: Date, attempt: number) => `AR-${churchId}-${renewsAt.getTime()}-${attempt}`;

async function paystack<T>(path: string, init?: RequestInit): Promise<{ http: number; body: T | null }> {
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  return { http: res.status, body: (await res.json().catch(() => null)) as T | null };
}

type PaystackEnvelope = { status?: boolean; message?: string; data?: (PaystackTxn & { gateway_response?: string }) | null };

/**
 * Try to renew one church from its saved card. `plan` and `interval` are what to charge for: usually what
 * the church is on, or the plan a scheduled downgrade just moved it to.
 */
export async function chargeSavedCard(churchId: string, plan: string, interval: "monthly" | "yearly"): Promise<ChargeOutcome> {
  if (!autoRenewEnabled()) return { status: "skipped", reason: "automatic charging is switched off" };

  const sub = await db.subscription.findUnique({ where: { churchId } });
  if (!sub || !sub.autoRenew || !sub.cardId || !sub.renewsAt) return { status: "skipped", reason: "not set up for automatic renewal" };
  if (sub.status === "grace") return { status: "skipped", reason: "gifted plan" };
  if (sub.renewalFailures >= MAX_FAILURES) return { status: "skipped", reason: "too many failed attempts" };

  const card = await getChargeableCard(churchId, sub.cardId);
  if (!card) return { status: "failed", reason: "the saved card is gone or can no longer be read", failures: sub.renewalFailures + 1, giveUp: true };
  if (cardExpired(card)) return { status: "failed", reason: "the saved card has expired", failures: MAX_FAILURES, giveUp: true };

  const attempt = sub.renewalFailures;
  const reference = attemptRef(churchId, sub.renewsAt, attempt);

  // 1. Was an earlier try under this reference actually successful, or still on its way?
  const earlier = await paystack<PaystackEnvelope>(`/transaction/verify/${encodeURIComponent(reference)}`);
  const earlierTxn = earlier.body?.data;
  if (earlier.http === 200 && earlierTxn?.status) {
    if (earlierTxn.status === "success") {
      const done = await activatePlanPayment(earlierTxn);
      if (done.ok) return { status: "renewed", amountGhs: done.amountGhs, plan: done.plan, interval: done.interval, renewsAt: await renewsAtOf(churchId) };
      return { status: "failed", reason: done.error, failures: attempt + 1, giveUp: false };
    }
    if (["pending", "ongoing", "processing", "queued"].includes(earlierTxn.status)) return { status: "pending" };
    // failed / abandoned / reversed: that attempt is over. Count it, and the next run uses a new reference.
    return { status: "failed", reason: earlierTxn.gateway_response || `the bank said ${earlierTxn.status}`, failures: attempt + 1, giveUp: attempt + 1 >= MAX_FAILURES };
  }

  // 2. Take the lock. If another run got here first, or we tried recently, stand down.
  const claimed = await db.subscription.updateMany({
    where: { churchId, OR: [{ lastRenewalAttemptAt: null }, { lastRenewalAttemptAt: { lt: new Date(Date.now() - RETRY_AFTER_MS) } }] },
    data: { lastRenewalAttemptAt: new Date() },
  });
  if (claimed.count === 0) return { status: "skipped", reason: "already attempted recently" };

  // 3. Price it exactly as a manual renewal would be priced.
  const { getPlatformConfig } = await import("@/lib/data/platform-config");
  const cfg = await getPlatformConfig();
  const price = cfg.prices[plan];
  const listUsd = interval === "yearly" ? (price?.yearly ?? 0) : (price?.monthly ?? 0);
  // A church in Ghana renews at its fixed cedi price; everyone else at the dollar price converted.
  const { chargeRate, churchIsGhana } = await import("@/lib/billing/local-price");
  const rate = chargeRate(cfg, plan, interval, await churchIsGhana(churchId));
  const amountGhs = Math.round(listUsd * rate);
  if (!(listUsd > 0) || !(amountGhs > 0)) return { status: "skipped", reason: "this plan has no price" };
  const subunits = amountGhs * 100;

  // 4. Charge. The metadata is sealed on the server, the same seal a checkout carries, so the result is
  //    accepted by activatePlanPayment on exactly the same terms as a payment the church made itself.
  const meta = sealMetadata(reference, subunits, SETTLEMENT_CURRENCY, {
    kind: "plan_upgrade",
    churchId,
    plan,
    interval,
    displayAmountUsd: listUsd,
    listAmountUsd: listUsd,
    couponId: null,
    usdToGhsRate: rate,
    prorated: false,
    renewal: true,
    saveCard: false,
    auto: true,
  });

  let charge;
  try {
    charge = await paystack<PaystackEnvelope>("/transaction/charge_authorization", {
      method: "POST",
      body: JSON.stringify({ authorization_code: card.authCode, email: card.email, amount: subunits, currency: SETTLEMENT_CURRENCY, reference, metadata: meta }),
    });
  } catch (e) {
    // The request itself failed, so we do not know whether it was made. Treat it as pending: the next run
    // looks the reference up before doing anything, so it cannot become a double charge.
    console.error("[auto-renew] charge request failed:", (e as Error).message);
    return { status: "pending" };
  }

  const txn = charge.body?.data;
  if (charge.body?.status && txn?.status === "success") {
    // Do not assume the charge response echoes our sealed metadata back. A verify always returns the full
    // transaction, metadata included, and is what the manual payment path trusts too.
    const confirm = await paystack<PaystackEnvelope>(`/transaction/verify/${encodeURIComponent(reference)}`).catch(() => null);
    const full = confirm?.http === 200 && confirm.body?.data?.status === "success" ? confirm.body.data : null;
    const done = await activatePlanPayment(full ?? { ...txn, reference: txn.reference ?? reference });
    if (done.ok) return { status: "renewed", amountGhs: done.amountGhs, plan: done.plan, interval: done.interval, renewsAt: await renewsAtOf(churchId) };
    return { status: "failed", reason: done.error, failures: attempt + 1, giveUp: false };
  }
  if (charge.body?.status && txn?.status && ["pending", "ongoing", "processing", "queued", "send_otp", "send_pin"].includes(txn.status)) {
    // A card that wants an OTP or PIN cannot be charged without the cardholder. Do not wait on it.
    if (txn.status === "send_otp" || txn.status === "send_pin") return { status: "failed", reason: "the bank needs the cardholder to approve this payment", failures: attempt + 1, giveUp: false };
    return { status: "pending" };
  }
  const reason = txn?.gateway_response || charge.body?.message || `payment was not accepted (${charge.http})`;
  return { status: "failed", reason, failures: attempt + 1, giveUp: attempt + 1 >= MAX_FAILURES };
}

async function renewsAtOf(churchId: string) {
  return (await db.subscription.findUnique({ where: { churchId }, select: { renewsAt: true } }))?.renewsAt ?? null;
}

export { MAX_FAILURES };
