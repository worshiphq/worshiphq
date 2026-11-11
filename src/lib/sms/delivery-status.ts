/**
 * Delivery status of one number on an SMS record. Pure helpers (no imports), shared by the sender, the
 * delivery checker and the pages, so every place reads a number's status the same way.
 *
 *   pending    the carrier took it and we are waiting for the phone network to report back (Hubtel)
 *   delivered  the network says it reached the phone
 *   sent       the carrier took it, but this carrier gives no delivery report, or the network never answered
 *   failed     refused by the carrier, or the network reported it could not be delivered
 */
export type DeliveryState = "pending" | "delivered" | "sent" | "failed";

/** What a number looks like inside SmsAuditLog.numbers. `ok` = the carrier accepted it (kept for older rows). */
export type LogNumber = { to: string; ok: boolean; id?: string; st?: DeliveryState; e?: string; at?: string };

/** The status of a number, including older rows that only stored ok true/false. */
export function stateOf(n: { ok: boolean; st?: DeliveryState }): DeliveryState {
  return n.st ?? (n.ok ? "sent" : "failed");
}

export function toLogNumber(r: { to: string; ok: boolean; id?: string; error?: string }, carrier?: string | null): LogNumber {
  if (!r.ok) return { to: r.to, ok: false, st: "failed", ...(r.error ? { e: r.error.slice(0, 160) } : {}) };
  // Only Hubtel can be asked later whether a message arrived, and only when it gave us the message id.
  const checkable = !!r.id && (carrier ?? "").includes("hubtel");
  return { to: r.to, ok: true, ...(r.id ? { id: r.id } : {}), st: checkable ? "pending" : "sent" };
}

export function countStatuses(numbers: { ok: boolean; st?: DeliveryState }[]) {
  const c = { delivered: 0, failed: 0, pending: 0, sent: 0 };
  for (const n of numbers) c[stateOf(n)]++;
  return c;
}

/** Hubtel's status words, grouped. Anything unknown stays pending until it settles or the record is closed. */
export function mapHubtelStatus(raw: unknown): DeliveryState | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "delivered" || s === "delivrd") return "delivered";
  if (["rejected", "undeliverable", "undelivered", "undeliv", "failed", "expired", "unrouteable", "error", "deleted", "rejectd"].includes(s)) return "failed";
  return "pending";
}

/** How a status reads to a church. */
export const STATE_LABEL: Record<DeliveryState, string> = {
  delivered: "Delivered",
  pending: "Waiting for the network",
  sent: "Sent",
  failed: "Not delivered",
};
