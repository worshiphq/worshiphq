import "server-only";
import { seal, open } from "@/lib/crypto-box";
import { last4 } from "@/lib/payroll/mask";

/**
 * Ghana Card, SSNIT number, TIN and bank or MoMo numbers are sealed (AES-256-GCM, key from the app secret) and only
 * the last 4 characters are stored in the clear for display. If the app secret is ever rotated, revealId returns null
 * and the screen asks the church to enter the number again.
 */
export function sealId(value: string): { sealed: string; last4: string } {
  const clean = value.trim();
  return { sealed: seal(clean), last4: last4(clean) };
}

export function revealId(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  return open(sealed);
}

export type SecretField = "ghanaCard" | "ssnitNo" | "tin" | "accountNo" | "momoNo";

export const SECRET_COLUMNS: Record<SecretField, { sealed: "ghanaCardSealed" | "ssnitNoSealed" | "tinSealed" | "accountNoSealed" | "momoNoSealed"; last4: "ghanaCardLast4" | "ssnitNoLast4" | "tinLast4" | "accountNoLast4" | "momoNoLast4"; label: string }> = {
  ghanaCard: { sealed: "ghanaCardSealed", last4: "ghanaCardLast4", label: "Ghana Card number" },
  ssnitNo: { sealed: "ssnitNoSealed", last4: "ssnitNoLast4", label: "SSNIT number" },
  tin: { sealed: "tinSealed", last4: "tinLast4", label: "TIN" },
  accountNo: { sealed: "accountNoSealed", last4: "accountNoLast4", label: "bank account number" },
  momoNo: { sealed: "momoNoSealed", last4: "momoNoLast4", label: "MoMo number" },
};
