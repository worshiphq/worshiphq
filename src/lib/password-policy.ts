/** Shared password policy — used by the sign-up wizard UI and the signUp server action. */

export const PASSWORD_RULES = [
  { key: "length", label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { key: "upper", label: "A capital letter (A–Z)", test: (p: string) => /[A-Z]/.test(p) },
  { key: "number", label: "A number (0–9)", test: (p: string) => /[0-9]/.test(p) },
  { key: "symbol", label: "A symbol (!@#$%…)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

export function passwordMeetsPolicy(password: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(password));
}
