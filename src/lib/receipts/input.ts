import { z } from "zod";
import { round2, type ReceiptBrand, type ReceiptItem, type ReceiptSheet } from "@/lib/receipts/types";

/** What the Receipts page sends: one receipt written by hand. Strict, used when saving. */
const money = z.number().finite().min(0).max(1_000_000_000);
export const itemSchema = z.object({
  description: z.string().trim().min(1, "Every line needs a description.").max(160),
  detail: z.string().trim().max(200).optional().default(""),
  qty: z.number().finite().positive("Quantity must be more than 0.").max(100000),
  unit: money,
});

export const manualReceiptSchema = z.object({
  brand: z.enum(["worshiphq", "wodona"]),
  sheet: z.enum(["a4", "half"]),
  churchId: z.string().max(40).nullish(),
  toName: z.string().trim().min(1, "Who is the receipt for?").max(120),
  toOrg: z.string().trim().max(160).optional().default(""),
  toEmail: z.string().trim().max(160).optional().default(""),
  toPhone: z.string().trim().max(40).optional().default(""),
  toAddress: z.string().trim().max(240).optional().default(""),
  currency: z.enum(["GHS", "USD", "EUR", "GBP"]),
  items: z.array(itemSchema).min(1, "Add at least one line.").max(30),
  discount: money.default(0),
  paid: money,
  method: z.string().trim().max(60).optional().default(""),
  reference: z.string().trim().max(120).optional().default(""),
  notes: z.string().trim().max(1200).optional().default(""),
  signatureLines: z.boolean().optional().default(false),
  /** YYYY-MM-DD, left out for today. */
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type ManualReceiptInput = z.input<typeof manualReceiptSchema>;
export type ManualReceipt = z.output<typeof manualReceiptSchema>;

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/** Noon UTC on that day, so the date reads the same in every time zone. */
export function dateFromYmd(ymd?: string): Date {
  if (!ymd) return new Date();
  const d = new Date(`${ymd}T12:00:00Z`);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * A forgiving read of the form for the live preview: while someone is still typing, half-filled fields should
 * show as a normal-looking receipt, not an error.
 */
export function draftFromForm(raw: unknown): {
  brand: ReceiptBrand; sheet: ReceiptSheet; toName: string; toOrg: string; toEmail: string; toPhone: string; toAddress: string; currency: string;
  items: ReceiptItem[]; discount: number; paid: number; method: string; reference: string; notes: string; signatureLines: boolean; issuedAt: Date;
} {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(n, 1_000_000_000) : 0; };
  const items: ReceiptItem[] = (Array.isArray(r.items) ? r.items : [])
    .map((i): ReceiptItem => {
      const o = (i && typeof i === "object" ? i : {}) as Record<string, unknown>;
      return { description: str(o.description, 160), detail: str(o.detail, 200) || undefined, qty: Math.max(num(o.qty), 0) || 1, unit: num(o.unit) };
    })
    .filter((i) => i.description)
    .slice(0, 30);
  const currency = ["GHS", "USD", "EUR", "GBP"].includes(String(r.currency)) ? String(r.currency) : "GHS";
  return {
    brand: r.brand === "wodona" ? "wodona" : "worshiphq",
    sheet: r.sheet === "half" ? "half" : "a4",
    toName: str(r.toName, 120) || "Customer name",
    toOrg: str(r.toOrg, 160), toEmail: str(r.toEmail, 160), toPhone: str(r.toPhone, 40), toAddress: str(r.toAddress, 240),
    currency,
    items: items.length ? items : [{ description: "Item description", qty: 1, unit: 0 }],
    discount: round2(num(r.discount)), paid: round2(num(r.paid)),
    method: str(r.method, 60), reference: str(r.reference, 120), notes: str(r.notes, 1200),
    signatureLines: r.signatureLines === true,
    issuedAt: dateFromYmd(typeof r.issuedOn === "string" ? r.issuedOn : undefined),
  };
}
