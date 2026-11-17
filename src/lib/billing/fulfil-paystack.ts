import "server-only";
import { recordOnlineGift, methodFromPaystackChannel } from "@/lib/giving/record";
import { addCredits } from "@/lib/sms/credits";
import { activatePlanPayment } from "@/lib/billing/activate-plan";
import { openSealedMetadata, rawMetadata, type PaystackTxn } from "@/lib/billing/checkout-seal";

export type FulfilResult = {
  kind: "sms_topup" | "plan_upgrade" | "online_gift" | "other";
  ok: boolean;
  ignored?: boolean;
  reason?: string;
  plan?: string;
  created?: boolean;
};

interface ChargeMetadata {
  kind?: string;
  churchId?: string;
  donorName?: string;
  email?: string;
  phone?: string;
  fundName?: string;
  extra?: string;
  intendedAmount?: number | string;
  credits?: number | string;
}

/**
 * Apply one successful Paystack charge: SMS credits, a plan, or a gift. Shared by the webhook and the Mobile Money
 * status check, so whichever arrives first does the work and the other finds it already done. Every branch is
 * idempotent on the reference (addCredits claims (churchId, reference), activatePlanPayment claims the PlanPayment
 * reference, recordOnlineGift is keyed on the reference). Throws on a processing error so the caller can retry.
 *
 * Only call this with a transaction Paystack itself reported as successful (webhook charge.success, or
 * GET /transaction/verify). Value-granting fields are only trusted when our seal matches the reference and amount.
 */
export async function fulfilPaystackCharge(data: PaystackTxn): Promise<FulfilResult> {
  const sealed = openSealedMetadata(data) as ChargeMetadata | null;
  const meta = (sealed ?? rawMetadata(data)) as ChargeMetadata;

  // SMS credit top-up: add credits to the church wallet.
  if (meta.kind === "sms_topup" && meta.churchId && data.reference) {
    // Paystack reports the amount in the smallest unit (pesewas).
    const paid = Number(data.amount ?? 0) / 100;
    let credits = sealed ? Number(meta.credits ?? 0) : 0;
    if (!sealed && paid > 0) {
      // Unsealed: give exactly what the money paid buys at this church's rate.
      const { pricingCredits } = await import("@/config/sms");
      const { resolveSmsPricing } = await import("@/lib/sms/intl");
      credits = pricingCredits(paid, await resolveSmsPricing(meta.churchId));
    }
    if (credits > 0) {
      await addCredits(meta.churchId, credits, "topup", {
        reference: data.reference,
        note: `${credits.toLocaleString()} SMS credits`,
        amountGhs: paid > 0 ? paid : undefined,
        source: "paystack",
      });
    }
    return { kind: "sms_topup", ok: true };
  }

  // Plan upgrade: activate the subscription (shared with verifyPlanUpgrade; once per reference).
  if (meta.kind === "plan_upgrade" && data.reference) {
    const res = await activatePlanPayment({ ...data, status: "success" });
    if (!res.ok) return { kind: "plan_upgrade", ok: false, ignored: true, reason: res.error };
    return { kind: "plan_upgrade", ok: true, plan: res.plan };
  }

  // Only our online-giving charges from here on; ignore subscription and other charges.
  if (meta.kind !== "online_gift" || !meta.churchId || !data.reference) {
    return { kind: "other", ok: false, ignored: true };
  }

  // A gift is only recorded for a charge OUR server started. Every real gift carries our seal. Paystack's public
  // key is public, so without this anyone could start a charge naming any church and make a gift appear on its
  // books, while the money landed in the platform's own account (no church subaccount) rather than the church's.
  if (!sealed) {
    console.warn(`[Paystack] ignored an unsealed online_gift charge ${data.reference}`);
    return { kind: "online_gift", ok: false, ignored: true, reason: "unsealed" };
  }

  // Prefer the phone the donor typed on our form; for a card payment (or if they left it blank) fall back to
  // whatever Paystack captured itself, such as the Mobile Money number used to complete the charge.
  const phone = meta.phone || data.customer?.phone || data.authorization?.mobile_money_number || null;
  // Record the amount the donor meant to give. When the donor bears Paystack's fee we charge a grossed-up amount,
  // so prefer the sealed intended amount, and never more than what was actually charged.
  const charged = (data.amount ?? 0) / 100;
  const intended = Number(meta.intendedAmount);
  const amountGhs = Number.isFinite(intended) && intended > 0 && intended <= charged ? intended : charged;
  const result = await recordOnlineGift({
    churchId: meta.churchId,
    reference: data.reference,
    amountGhs, // cedis
    donorName: meta.donorName ?? "Anonymous",
    email: data.customer?.email ?? meta.email ?? null,
    phone,
    fundName: meta.fundName ?? null,
    method: methodFromPaystackChannel(data.channel, data.authorization?.bank),
    extra: parseExtra(meta.extra),
  });
  return { kind: "online_gift", ok: true, created: result.created };
}

function parseExtra(raw: unknown): { label: string; value: string }[] | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => x && typeof x.label === "string" && typeof x.value === "string").slice(0, 40) : undefined;
  } catch {
    return undefined;
  }
}
