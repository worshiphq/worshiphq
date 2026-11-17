import type { MomoChargeStatus } from "@/lib/momo/charge-status";

/** The attempt a "Try again" replaces, so the server can check it before charging again. */
export type MomoPrevious = { reference: string; token: string };

/** How the payer chose to pay in the payment sheet. Card keeps today's Paystack popup. */
export type MomoPay =
  | { method: "momo"; phone: string; network: string; previous?: MomoPrevious }
  | { method: "card" };

/** What a server action hands back after starting a Mobile Money charge. */
export type MomoStartResult = {
  reference: string;
  /** Lets the page check this one charge (and nothing else) for 30 minutes. */
  token: string;
  status: MomoChargeStatus;
  displayText?: string;
  message?: string;
  /** Test mode (no Paystack key): approves itself after a few seconds. */
  stubbed?: boolean;
};
