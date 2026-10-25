/** Shared receipt types and small helpers. No server-only imports, so the admin screen can use them too. */

export type ReceiptBrand = "worshiphq" | "wodona";
export type ReceiptSheet = "a4" | "half";
export type ReceiptKind = "manual" | "registration" | "upgrade" | "gift";

export type ReceiptItem = {
  description: string;
  /** A smaller second line under the description (serial number, period, notes). */
  detail?: string;
  qty: number;
  /** Price of one, in the receipt's currency. */
  unit: number;
};

/** What the company details printed on a receipt say. Edited on the Receipts page. */
export type ReceiptSettings = {
  companyName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  /** Business registration or tax number, shown in the footer when filled in. */
  registration: string;
  /** Contact printed on WorshipHQ receipts (churches write here with questions). */
  whqEmail: string;
  whqWebsite: string;
  /** Who signs every receipt (name printed under the signature). */
  issuedBy: string;
  /** The issuer's signature as a transparent PNG data URL, printed on every receipt. Empty = a blank signing space. */
  signature: string;
};

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  companyName: "WODONA",
  tagline: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  registration: "",
  whqEmail: "",
  whqWebsite: "worshiphq.app",
  issuedBy: "Worship Odoi",
  signature: "",
};

/** Everything the PDF needs. Built from a stored Receipt row (or the unsaved form, for the preview). */
export type ReceiptData = {
  brand: ReceiptBrand;
  sheet: ReceiptSheet;
  kind: ReceiptKind;
  /** null while previewing: the number is given when the receipt is saved. */
  number: string | null;
  issuedAt: Date;
  toName: string;
  toOrg?: string | null;
  toEmail?: string | null;
  toPhone?: string | null;
  toAddress?: string | null;
  currency: string;
  items: ReceiptItem[];
  discount: number;
  /** Everything paid on this sale so far, including this receipt. */
  paid: number;
  /** What had been paid before this receipt. More than 0 means this receipt is for a payment towards a balance. */
  paidBefore?: number;
  /** The number of the earlier receipt this one follows (balance payments). */
  followsNumber?: string | null;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  signatureLines?: boolean;
  /** Registration receipts: the welcome panel for a free account. */
  welcome?: { church: string; members: number | null; features: string[] };
  settings: ReceiptSettings;
};

export const PAYMENT_METHODS = ["Cash", "Mobile Money", "Bank transfer", "Cheque", "Card", "Paystack", "Other"] as const;

export const CURRENCIES: Record<string, string> = { GHS: "GH₵", USD: "US$", EUR: "€", GBP: "£", NGN: "₦" };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export { round2 };

export function money(n: number, currency = "GHS"): string {
  const sym = CURRENCIES[currency] ?? currency;
  const neg = n < 0;
  const [whole, frac] = Math.abs(round2(n)).toFixed(2).split(".");
  return `${neg ? "-" : ""}${sym} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}

export function totalsOf(items: ReceiptItem[], discount: number, paid: number) {
  const subtotal = round2(items.reduce((t, i) => t + round2(i.qty * i.unit), 0));
  const disc = round2(Math.min(Math.max(discount, 0), subtotal));
  const total = round2(subtotal - disc);
  const balance = round2(Math.max(total - paid, 0));
  return { subtotal, discount: disc, total, balance };
}

export function receiptNumber(r: { brand: string; year: number; seq: number }): string {
  return `${r.brand === "wodona" ? "WOD" : "WHQ"}-${r.year}-${String(r.seq).padStart(4, "0")}`;
}

export function receiptStatus(d: Pick<ReceiptData, "kind" | "items" | "discount" | "paid" | "paidBefore">): { label: string; tone: "paid" | "free" | "part" | "gift" } {
  if (d.kind === "registration") return { label: "FREE FOREVER", tone: "free" };
  if (d.kind === "gift") return { label: "GIFT", tone: "gift" };
  const { total, balance } = totalsOf(d.items, d.discount, d.paid);
  if (total > 0 && balance <= 0 && (d.paidBefore ?? 0) > 0) return { label: "PAID IN FULL", tone: "paid" };
  if (total > 0 && balance > 0 && d.paid > 0) return { label: "PART PAYMENT", tone: "part" };
  if (total > 0 && d.paid <= 0) return { label: "UNPAID", tone: "part" };
  return { label: "PAID", tone: "paid" };
}

/** A signature is stored as a small transparent PNG data URL. */
export const SIGNATURE_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
export const SIGNATURE_MAX_CHARS = 240_000;
