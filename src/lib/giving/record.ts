import "server-only";
import { db } from "@/lib/db";
import { sendSms } from "@/lib/integrations/sms";
import { sendEmail } from "@/lib/integrations/email";
import type { GiftMethod } from "@prisma/client";

/** Map a human label (form value / Paystack metadata) to the Gift method enum. */
export const GIFT_METHOD_FROM_LABEL: Record<string, GiftMethod> = {
  "MTN MoMo": "MTN_MoMo",
  MTN_MoMo: "MTN_MoMo",
  "Telecel Cash": "Telecel_Cash",
  Telecel_Cash: "Telecel_Cash",
  AirtelTigo: "AirtelTigo",
  Card: "Card",
  Cash: "Cash",
};

/** Map a Paystack `channel` (returned on success) to a Gift method. */
export function methodFromPaystackChannel(channel?: string, hint?: string): GiftMethod {
  if (channel === "card") return "Card";
  if (channel === "mobile_money") return GIFT_METHOD_FROM_LABEL[hint ?? ""] ?? "MTN_MoMo";
  return GIFT_METHOD_FROM_LABEL[hint ?? ""] ?? "Card";
}

export interface OnlineGiftInput {
  churchId: string;
  reference: string;
  amountGhs: number;
  donorName: string;
  email?: string | null;
  phone?: string | null;
  fundName?: string | null;
  method?: GiftMethod;
}

/**
 * Record an online gift, idempotently keyed on its Paystack `reference`.
 * Resolves the fund (creating it if new), tries to match an existing member by
 * name, creates the Gift, and sends an SMS + email receipt. Safe to call twice
 * for the same reference (e.g. webhook retries) — it will only create once.
 */
export async function recordOnlineGift(
  input: OnlineGiftInput,
): Promise<{ created: boolean; giftId?: string }> {
  const { churchId, reference } = input;

  // Idempotency: never create the same gift twice.
  const existing = await db.gift.findFirst({
    where: { churchId, reference },
    select: { id: true },
  });
  if (existing) return { created: false, giftId: existing.id };

  const donorName = input.donorName.trim() || "Anonymous";
  const amount = input.amountGhs;
  if (!amount || amount <= 0) return { created: false };

  // Resolve fund (create on the fly if it doesn't exist yet for this church).
  let fundId: string | undefined;
  const fundName = input.fundName?.trim();
  if (fundName) {
    const fund =
      (await db.fund.findFirst({ where: { churchId, name: fundName } })) ??
      (await db.fund.create({ data: { churchId, name: fundName } }));
    fundId = fund.id;
  }

  // Try to match an existing member by name.
  const [first, ...rest] = donorName.split(" ");
  const person = await db.person.findFirst({
    where: { churchId, firstName: first, lastName: rest.join(" ") || undefined },
    select: { id: true },
  });

  const gift = await db.gift.create({
    data: {
      churchId,
      personId: person?.id,
      donorName,
      fundId,
      amount,
      method: input.method ?? "MTN_MoMo",
      currency: "GHS",
      reference,
      receiptSent: false,
    },
  });

  // ── Send a receipt (SMS + email). Stub mode just logs. ──
  const church = await db.church.findUnique({
    where: { id: churchId },
    select: { name: true },
  });
  const churchName = church?.name ?? "your church";
  const amountStr = `₵${amount.toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;
  const fundSuffix = fundName ? ` to the ${fundName}` : "";

  let receiptSent = false;
  if (input.phone) {
    const sms = await sendSms(
      input.phone,
      `${churchName}: We received your gift of ${amountStr}${fundSuffix}. Thank you & God bless you! Ref ${reference}`,
    );
    receiptSent = receiptSent || sms.ok;
  }
  if (input.email) {
    const email = await sendEmail({
      to: input.email,
      subject: `Your giving receipt — ${churchName}`,
      html: receiptHtml({ churchName, donorName, amountStr, fundName, reference }),
    });
    receiptSent = receiptSent || email.ok;
  }

  if (receiptSent) {
    await db.gift.update({ where: { id: gift.id }, data: { receiptSent: true } });
  }

  return { created: true, giftId: gift.id };
}

function receiptHtml(o: {
  churchName: string;
  donorName: string;
  amountStr: string;
  fundName?: string | null;
  reference: string;
}): string {
  return `
  <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1c1a16">
    <h2 style="margin:0 0 4px;color:#0d7377">Thank you, ${o.donorName}</h2>
    <p style="margin:0 0 16px;color:#6b6560">${o.churchName} gratefully acknowledges your gift.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:8px 0;color:#6b6560">Amount</td><td style="padding:8px 0;text-align:right;font-weight:700">${o.amountStr}</td></tr>
      ${o.fundName ? `<tr><td style="padding:8px 0;color:#6b6560">Fund</td><td style="padding:8px 0;text-align:right">${o.fundName}</td></tr>` : ""}
      <tr><td style="padding:8px 0;color:#6b6560">Reference</td><td style="padding:8px 0;text-align:right;font-family:monospace">${o.reference}</td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:13px;color:#a09888">"Each of you should give what you have decided in your heart to give." — 2 Corinthians 9:7</p>
  </div>`;
}
