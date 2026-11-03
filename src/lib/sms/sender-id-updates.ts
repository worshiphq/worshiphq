import "server-only";
import { supportEmail } from "@/lib/lockout";
import { SENDER_ID_UPDATE_OPTIONS, type SenderIdUpdateKey } from "@/config/sender-id";

/**
 * The messages SuperAdmin can send a church about its Sender ID request.
 *
 * A Sender ID is not ours to approve on the spot - it goes to the network, which takes days. Until
 * now the church heard nothing at all between asking and being approved or rejected, so the only
 * way to reassure anyone was to remember to text them by hand. Silence is what makes people chase,
 * and chasing is what makes them doubt the product.
 *
 * Each template is deliberately short: one SMS segment where possible, no jargon, and it always
 * says what happens next rather than only what is happening now.
 */
export type SenderIdUpdate = {
  key: SenderIdUpdateKey;
  label: string;            // what the button says in SuperAdmin
  /** The status to move the church to, or null to leave it where it is. */
  status: string | null;
  body: (ctx: { senderId: string; churchName: string }) => string;
};

export const SENDER_ID_UPDATES: SenderIdUpdate[] = [
  {
    key: "received",
    label: "We've got it",
    status: "pending",
    body: ({ senderId }) =>
      `We've received your Sender ID request for "${senderId}". We're working on it now and will text you as soon as there's news. Nothing else is needed from you.`,
  },
  {
    key: "submitted",
    label: "Sent to the network",
    status: "submitted",
    body: ({ senderId }) =>
      `Update on your Sender ID "${senderId}": we've submitted it to the mobile networks for approval. This usually takes a few working days. We'll text you the moment it's approved.`,
  },
  {
    key: "delayed",
    label: "Taking longer",
    status: "submitted",
    body: ({ senderId }) =>
      `Update on your Sender ID "${senderId}": the networks are taking longer than usual to approve it. It is still in the queue and we are following it up. Your texts keep sending normally in the meantime.`,
  },
  {
    key: "needs_info",
    label: "Need something from them",
    status: "pending",
    body: ({ senderId }) =>
      `About your Sender ID "${senderId}": we need one more detail from you before the networks will approve it. Please reply to us at ${supportEmail()} and we'll sort it out quickly.`,
  },
  {
    key: "resubmitted",
    label: "Resubmitted after a rejection",
    status: "submitted",
    body: ({ senderId }) =>
      `Good news on your Sender ID "${senderId}": we've fixed what the networks flagged and resubmitted it. We'll text you as soon as they confirm.`,
  },
];

export function senderIdUpdate(key: string): SenderIdUpdate | undefined {
  return SENDER_ID_UPDATES.find((u) => u.key === key);
}

// Every key the SuperAdmin menu offers must have a message here, or the button would send nothing.
const LABELS = new Map(SENDER_ID_UPDATE_OPTIONS.map((o) => [o.key, o.label]));
for (const u of SENDER_ID_UPDATES) {
  if (!LABELS.has(u.key)) throw new Error(`Sender ID update "${u.key}" is not in SENDER_ID_UPDATE_OPTIONS`);
}
