import "server-only";
import { db } from "@/lib/db";

export type BillingEventKind =
  | "reminder" | "expired" | "downgraded" | "lapsed"
  | "auto_renewed" | "auto_renew_failed"
  | "card_saved" | "card_removed" | "auto_renew_on" | "auto_renew_off";

/**
 * Record something the billing system told a church or did for it. The SuperAdmin renewals page reads
 * these, so the owner can see what each church was actually told and whether it was delivered.
 * Never throws: a failed log line must not undo a payment or stop the daily billing run.
 */
export async function logBillingEvent(
  churchId: string,
  e: { kind: BillingEventKind; title: string; detail?: string; channels?: string[]; delivered?: boolean },
) {
  try {
    await db.billingEvent.create({
      data: {
        churchId,
        kind: e.kind,
        title: e.title,
        detail: e.detail ?? null,
        channels: e.channels?.length ? e.channels.join(",") : null,
        delivered: e.delivered ?? true,
      },
    });
  } catch (err) {
    console.error("[billing event]", (err as Error).message);
  }
}
