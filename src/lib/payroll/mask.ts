/** Staff & Payroll: masking and small guards. PURE (tsx-testable, client-safe). */

/** "MTN MoMo ending 4821", "GCB ending 0042", "Cash". Never the full number. */
export function maskLabel(method: string | null | undefined, opts: { network?: string | null; bankName?: string | null; last4?: string | null } = {}): string {
  const end = opts.last4 ? ` ending ${opts.last4}` : "";
  switch (method) {
    case "momo": return `${opts.network ? `${opts.network} ` : ""}MoMo${end}`.trim();
    case "bank": return `${opts.bankName || "Bank"}${end}`;
    case "cheque": return "Cheque";
    case "cash": return "Cash";
    default: return "Not set";
  }
}

/** The last 4 characters of an ID or account number, ignoring spaces and dashes. */
export function last4(value: string): string {
  return value.replace(/[\s-]/g, "").slice(-4);
}

/** "GHA-•••••••12-3" style mask for a Ghana Card, or "••••4821" for anything else. */
export function maskId(kind: "ghanaCard" | "ssnit" | "tin" | "account" | "momo", l4: string | null | undefined): string {
  if (!l4) return "Not added";
  if (kind === "ghanaCard") return `GHA-•••••••${l4.slice(-3, -1)}-${l4.slice(-1)}`;
  return `••••${l4}`;
}

export const GHANA_CARD_RE = /^GHA-\d{9}-\d$/;

/** Expenses and transactions written by Payroll are locked everywhere else: they are reversed from the payroll run. */
export function isPayrollLocked(row: { payrollRunId?: string | null; staffLoanId?: string | null } | null | undefined): boolean {
  return !!row && (!!row.payrollRunId || !!row.staffLoanId);
}

export const PAYROLL_LOCKED_MESSAGE = "This came from Payroll. Reverse it from the payroll run instead.";

/** SMS text for a payslip notice. Amounts only when the church switched them on (texts are kept in SMS records). */
export function payslipSmsText(churchName: string, period: string, net?: string | null): string {
  const amount = net ? ` Net pay: ${net}.` : "";
  return `Your payslip for ${period} from ${churchName} is ready.${amount} Sign in to WorshipHQ or ask the office for a copy.`;
}
