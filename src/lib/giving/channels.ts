// Client-safe helpers for how giving is grouped: by the kind of fund (tithes,
// offertory, other) and by the channel the money came through (cash, Mobile
// Money, bank/card). Offertory is counted and banked together, so it is shown
// as one total with a split by channel instead of a list of names.

export type Channel = "cash" | "momo" | "bank";
export type FundKind = "tithes" | "offertory" | "other";

export const CHANNEL_LABEL: Record<Channel, string> = { cash: "Cash", momo: "Mobile Money", bank: "Bank / card" };

/** GiftMethod value → channel. */
export function channelOf(method: string): Channel {
  if (method === "Cash") return "cash";
  if (method === "MTN_MoMo" || method === "Telecel_Cash" || method === "AirtelTigo") return "momo";
  return "bank"; // Card, Bank
}

/** Which family a fund belongs to, by its name. */
export function fundKind(name: string | null | undefined): FundKind {
  const n = (name ?? "").toLowerCase();
  if (/tithe/.test(n)) return "tithes";
  if (/offer/.test(n)) return "offertory"; // Offertory, Offering, Sunday Offering...
  return "other";
}

/** A gift written by the "record collection" form (a counted total, not a person). */
export function isCollectionGift(g: { donorName: string | null; reference: string | null }): boolean {
  return !g.reference && /collection/i.test(g.donorName ?? "");
}

/** Value stored on the Gift for each channel (Mobile Money keeps the network). */
export const COLLECTION_METHODS = {
  cash: [{ value: "Cash", label: "Cash" }],
  momo: [{ value: "MTN_MoMo", label: "MTN MoMo" }, { value: "Telecel_Cash", label: "Telecel Cash" }, { value: "AirtelTigo", label: "AirtelTigo" }],
  bank: [{ value: "Bank", label: "Bank transfer / cheque" }, { value: "Card", label: "Card" }],
} as const;
