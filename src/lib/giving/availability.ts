/**
 * Whether churches may apply for (or change) online-giving payout accounts right now. Onboarding a payout
 * account and changing one both go through Paystack, so when Paystack onboarding is paused this is closed and
 * the apply/change forms are replaced with a kind message. Existing, approved giving is unaffected.
 *
 * Closed unless ONLINE_GIVING_OPEN is set to "true"/"1"/"yes", so it ships closed and is reopened deliberately.
 * This is a plain string read (not NEXT_PUBLIC_), so it is only meaningful on the server; the message constant
 * is safe to import anywhere.
 */
export function onlineGivingApplicationsOpen(): boolean {
  const v = (process.env.ONLINE_GIVING_OPEN ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** Shown to churches in place of the apply/change form while applications are paused. */
export const GIVING_CLOSED_MESSAGE =
  "New online-giving applications are paused for now while we upgrade our payment system. Nothing about your current setup changes, and your members can still give in person and by your usual methods. We will reopen applications soon - thank you for your patience.";

/**
 * Shown to a church whose application is already in review while approvals are paused, and sent to those
 * churches as the one-time pause notice. One source so the in-app banner and the email always match.
 */
export const GIVING_PAUSED_INREVIEW_MESSAGE =
  "We've received your request. We've temporarily paused new online-giving approvals while we upgrade our payment system, so this may take a little longer than usual. Your request is safe in the queue and we'll continue as soon as it reopens - nothing more is needed from you.";
