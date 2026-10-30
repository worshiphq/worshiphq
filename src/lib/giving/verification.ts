/**
 * The checklist SuperAdmin completes before approving where a church's online giving money goes. Approving sets a payout
 * account, so a fake church or a hijacked login could send other people's gifts to a fraudster. Every required box must be
 * ticked first, and a change to an existing payout account is also held for a day so the church's own admins can object.
 */

export const VERIFICATION_CHECKS = [
  { key: "calledIndependent", required: true, label: "I phoned the church on a number I found myself (their website, Facebook page, Google Maps or the denomination), not only the number in the request." },
  { key: "secondLeader", required: true, label: "I spoke to a second leader of the church, as well as the person who asked." },
  { key: "accountNameMatches", required: true, label: "The name on the payout account matches the church. If it is a personal account, two leaders confirmed it in writing." },
  { key: "proofSeen", required: true, label: "I saw proof: a registration certificate, a letter from the denomination, or the pastor's ID." },
  { key: "looksReal", required: true, label: "The church looks real in WorshipHQ: real members and activity, not a brand new empty account." },
  { key: "testPayment", required: false, label: "A GHS 1 test payment was made and the church read the reference back (recommended)." },
] as const;

export type Verification = { checks: Record<string, boolean>; note?: string; by?: string; at?: string };

/** A change to an existing payout account waits this long before it can be approved. */
export const CHANGE_HOLD_HOURS = 24;

export function readVerification(v: unknown): Verification | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { checks?: unknown; note?: unknown; by?: unknown; at?: unknown };
  if (!o.checks || typeof o.checks !== "object") return null;
  const checks: Record<string, boolean> = {};
  for (const c of VERIFICATION_CHECKS) checks[c.key] = (o.checks as Record<string, unknown>)[c.key] === true;
  return {
    checks,
    note: typeof o.note === "string" ? o.note : undefined,
    by: typeof o.by === "string" ? o.by : undefined,
    at: typeof o.at === "string" ? o.at : undefined,
  };
}

/** True when every required check is ticked. */
export function isVerified(v: unknown): boolean {
  const r = readVerification(v);
  return !!r && VERIFICATION_CHECKS.every((c) => !c.required || r.checks[c.key]);
}
