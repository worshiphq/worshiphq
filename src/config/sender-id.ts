/**
 * Sender ID updates, as the SuperAdmin list shows them.
 *
 * Only the keys and the button labels live here, so the client can render the menu. The message
 * bodies stay in lib/sms/sender-id-updates.ts, which is server-only - but it builds its list from
 * these keys, so the menu can never offer an update that has no message behind it.
 */
export const SENDER_ID_UPDATE_OPTIONS = [
  { key: "received", label: "We've got it" },
  { key: "submitted", label: "Sent to the network" },
  { key: "delayed", label: "Taking longer" },
  { key: "needs_info", label: "Need something from them" },
  { key: "resubmitted", label: "Resubmitted after a rejection" },
] as const;

export type SenderIdUpdateKey = (typeof SENDER_ID_UPDATE_OPTIONS)[number]["key"];

/** How a Sender ID status reads. "submitted" sits between pending and approved. */
export const SENDER_ID_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  submitted: "With the networks",
  approved: "Approved",
  rejected: "Rejected",
};
