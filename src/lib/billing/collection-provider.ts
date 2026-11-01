import "server-only";
import { db } from "@/lib/db";
import { env, features } from "@/lib/env";
import type { HubtelConfig } from "@/lib/integrations/hubtel-pay";

export type CollectionProvider = "paystack" | "hubtel";

/**
 * Which provider receives WorshipHQ's own collections right now. Read defensively: if the PaymentSetting
 * table is not migrated yet, or anything goes wrong, we fall back to Paystack so payments never break.
 */
export async function getCollectionProvider(): Promise<CollectionProvider> {
  try {
    const row = await db.paymentSetting.findUnique({ where: { id: "default" }, select: { collectionProvider: true } });
    const p = row?.collectionProvider;
    // Only honour Hubtel when it is actually configured, so a stray switch can never strand payments.
    if (p === "hubtel" && features.hubtelPay) return "hubtel";
    return "paystack";
  } catch {
    return "paystack";
  }
}

/** Set the switch (SuperAdmin only; the caller enforces that). */
export async function setCollectionProvider(provider: CollectionProvider): Promise<void> {
  await db.paymentSetting.upsert({
    where: { id: "default" },
    update: { collectionProvider: provider },
    create: { id: "default", collectionProvider: provider },
  });
}

/** Hubtel payment config from env, or null when it is not fully set up. */
export function hubtelConfig(): HubtelConfig | null {
  if (!features.hubtelPay) return null;
  return { apiId: env.HUBTEL_POS_API_ID!, apiKey: env.HUBTEL_POS_API_KEY!, merchantAccount: env.HUBTEL_MERCHANT_ACCOUNT! };
}

/**
 * Close off payment intents nobody ever completed. A checkout the payer abandoned leaves a "pending" intent
 * forever; this marks ones older than `olderThanHours` as "expired" so the data stays clean. The window is
 * generous (a day) because the Hubtel callback only ever acts on a "pending" intent - nobody finishes a
 * checkout a day later, so this can never race a real, late payment. Safe to call repeatedly (e.g. from cron).
 */
export async function expireStalePaymentIntents(olderThanHours = 24): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - olderThanHours * 3600_000);
    const res = await db.paymentIntent.updateMany({
      where: { status: "pending", createdAt: { lt: cutoff } },
      data: { status: "expired" },
    });
    return res.count;
  } catch {
    // The table may not be migrated on every environment; a cleanup failure is never fatal.
    return 0;
  }
}
