export interface OpenInvoice {
  id: string;
  termStart: Date; // oldest term first
  balance: number;
}

export interface Allocation {
  invoiceId: string;
  amount: number;
}

const cents = (n: number) => Math.round(n * 100);

/** Applies a payment to the oldest open invoices first. Remainder (credit) is returned, never lost. */
export function allocatePayment(amount: number, invoices: OpenInvoice[]) {
  let left = cents(amount);
  const allocations: Allocation[] = [];
  const ordered = [...invoices].sort((a, b) => a.termStart.getTime() - b.termStart.getTime());
  for (const inv of ordered) {
    if (left <= 0) break;
    const due = cents(inv.balance);
    if (due <= 0) continue;
    const pay = Math.min(left, due);
    allocations.push({ invoiceId: inv.id, amount: pay / 100 });
    left -= pay;
  }
  return { allocations, credit: left / 100 };
}

export type DiscountRule = { type: "PERCENT" | "FIXED"; value: number };

/** Discounts apply to tuition-type subtotal; never take the invoice below zero. */
export function discountAmount(subtotal: number, rules: DiscountRule[]): number {
  let total = 0;
  for (const r of rules) total += r.type === "PERCENT" ? (subtotal * r.value) / 100 : r.value;
  return Math.min(Math.round(total * 100) / 100, subtotal);
}

export function invoiceStatus(total: number, paid: number, cancelled = false) {
  if (cancelled) return "CANCELLED" as const;
  if (paid <= 0) return "ISSUED" as const;
  return cents(paid) >= cents(total) ? ("PAID" as const) : ("PARTIAL" as const);
}
