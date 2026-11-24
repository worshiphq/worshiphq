import "server-only";
import { db } from "@/lib/db";
import { env, features } from "@/lib/env";
import { hubtelStatus } from "@/lib/sms/delivery";
import { emailInsteadOfText } from "@/lib/outreach/send";

/**
 * Outreach texts Hubtel took but the phone network could not deliver (a wrong or dead number) are emailed instead.
 * Needs the OutreachDelivery table (sql/outreach-delivery.sql). Until that exists every call here does nothing, so
 * sending itself is never affected.
 */
const STOP_AFTER_MS = 72 * 3600_000;

export async function checkOutreachDeliveries(opts: { churchId?: string; budgetMs?: number } = {}) {
  const started = Date.now();
  const budget = opts.budgetMs ?? 8_000;
  const summary = { checked: 0, delivered: 0, emailed: 0 };
  if (!features.sms || !env.HUBTEL_CLIENT_ID || !env.HUBTEL_CLIENT_SECRET) return summary;
  try {
    const rows = await db.outreachDelivery.findMany({
      where: { state: "pending", createdAt: { lte: new Date(Date.now() - 60_000) }, ...(opts.churchId ? { churchId: opts.churchId } : {}) },
      // The one asked about longest ago goes first, so a text that stays pending never holds up the rest.
      orderBy: { checkedAt: { sort: "asc", nulls: "first" } },
      take: 60,
    });
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(5, rows.length) }, async () => {
      while (next < rows.length && Date.now() - started < budget) {
        const row = rows[next++]!;
        summary.checked++;
        try {
          const { state } = await hubtelStatus(row.smsId);
          const settled = state === "delivered" || state === "failed" ? state : Date.now() - row.createdAt.getTime() > STOP_AFTER_MS ? "sent" : null;
          // Claimed by the update itself, so two runs at once can never both send the email.
          const claim = await db.outreachDelivery.updateMany({
            where: { id: row.id, state: "pending" },
            data: { checkedAt: new Date(), ...(settled ? { state: settled } : {}) },
          });
          if (settled === "delivered") summary.delivered++;
          if (settled !== "failed" || claim.count === 0) continue;
          const msg = await db.outreachMessage.findUnique({ where: { id: row.id }, select: { churchId: true, userId: true, template: true, body: true } });
          if (!msg?.userId) continue;
          const r = await emailInsteadOfText({ churchId: msg.churchId, userId: msg.userId, template: msg.template, body: msg.body, auto: true });
          if (r.ok) summary.emailed++;
        } catch (e) {
          console.error("[outreach delivery]", (e as Error).message);
        }
      }
    }));
  } catch (e) {
    console.error("[outreach delivery]", (e as Error).message);
  }
  return summary;
}
