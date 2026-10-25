import "server-only";
import type { Receipt } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/integrations/email";
import { escapeHtml } from "@/lib/html";
import { renderReceiptPdf } from "@/lib/receipts/pdf";
import {
  DEFAULT_RECEIPT_SETTINGS, SIGNATURE_MAX_CHARS, SIGNATURE_PATTERN, money, receiptNumber, round2, totalsOf,
  type ReceiptBrand, type ReceiptData, type ReceiptItem, type ReceiptKind, type ReceiptSettings, type ReceiptSheet,
} from "@/lib/receipts/types";

/* ── company details printed on receipts ── */

function validSignature(v: string): boolean {
  return v.length <= SIGNATURE_MAX_CHARS && SIGNATURE_PATTERN.test(v);
}

export async function getReceiptSettings(): Promise<ReceiptSettings> {
  const cfg = await db.platformConfig.findUnique({ where: { id: "default" }, select: { receiptSettings: true } });
  const saved = (cfg?.receiptSettings && typeof cfg.receiptSettings === "object" ? cfg.receiptSettings : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_RECEIPT_SETTINGS } as Record<string, string>;
  for (const key of Object.keys(DEFAULT_RECEIPT_SETTINGS)) {
    const v = saved[key];
    if (key === "signature") out.signature = typeof v === "string" && validSignature(v) ? v : "";
    else if (typeof v === "string") out[key] = v.trim().slice(0, 200);
  }
  // Until someone fills them in, replies go to the platform owner's inbox.
  if (!out.email) out.email = env.SUPERADMIN_EMAIL;
  return out as unknown as ReceiptSettings;
}

export async function saveReceiptSettings(input: Partial<ReceiptSettings>): Promise<ReceiptSettings> {
  const clean: Record<string, string> = {};
  for (const key of Object.keys(DEFAULT_RECEIPT_SETTINGS) as (keyof ReceiptSettings)[]) {
    const v = input[key];
    if (key === "signature") clean.signature = typeof v === "string" && validSignature(v) ? v : "";
    else clean[key] = typeof v === "string" ? v.trim().slice(0, 200) : "";
  }
  await db.platformConfig.upsert({
    where: { id: "default" },
    update: { receiptSettings: clean },
    create: { id: "default", receiptSettings: clean },
  });
  return getReceiptSettings();
}

/* ── saving a receipt ── */

export type NewReceipt = {
  brand: ReceiptBrand;
  sheet: ReceiptSheet;
  kind: ReceiptKind;
  churchId?: string | null;
  toName: string;
  toOrg?: string | null;
  toEmail?: string | null;
  toPhone?: string | null;
  toAddress?: string | null;
  currency?: string;
  items: ReceiptItem[];
  discount?: number;
  /** Everything paid on this sale so far, including this receipt. */
  paid: number;
  paidBefore?: number;
  relatedId?: string | null;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  signatureLines?: boolean;
  issuedAt?: Date;
};

const nul = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** Saves the receipt and gives it the next number for its brand and year (WHQ-2026-0001, WOD-2026-0001, ...). */
export async function createReceipt(input: NewReceipt): Promise<Receipt> {
  const issuedAt = input.issuedAt ?? new Date();
  const year = issuedAt.getUTCFullYear();
  const items = input.items.map((i) => ({ description: i.description, ...(i.detail ? { detail: i.detail } : {}), qty: i.qty, unit: round2(i.unit) }));
  const t = totalsOf(items, input.discount ?? 0, input.paid);
  for (let attempt = 0; attempt < 6; attempt++) {
    const last = await db.receipt.findFirst({ where: { brand: input.brand, year }, orderBy: { seq: "desc" }, select: { seq: true } });
    try {
      return await db.receipt.create({
        data: {
          brand: input.brand, year, seq: (last?.seq ?? 0) + 1, kind: input.kind, sheet: input.sheet,
          churchId: input.churchId ?? null,
          toName: input.toName.trim(), toOrg: nul(input.toOrg), toEmail: nul(input.toEmail), toPhone: nul(input.toPhone), toAddress: nul(input.toAddress),
          currency: input.currency || "GHS", items, discount: t.discount, total: t.total, paid: round2(input.paid),
          paidBefore: round2(input.paidBefore ?? 0), relatedId: input.relatedId ?? null,
          method: nul(input.method), reference: nul(input.reference), notes: nul(input.notes), signatureLines: !!input.signatureLines, issuedAt,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") continue; // two receipts took the same number at once: try the next one
      throw e;
    }
  }
  throw new Error("Could not number the receipt. Please try again.");
}

/* ── drawing a saved receipt ── */

export function itemsOf(row: { items: unknown }): ReceiptItem[] {
  return (Array.isArray(row.items) ? row.items : []).map((i) => {
    const o = (i ?? {}) as Record<string, unknown>;
    return { description: String(o.description ?? ""), detail: o.detail ? String(o.detail) : undefined, qty: Number(o.qty) || 1, unit: Number(o.unit) || 0 };
  });
}

export async function dataFromRow(row: Receipt, settings?: ReceiptSettings): Promise<ReceiptData> {
  const data: ReceiptData = {
    brand: row.brand === "wodona" ? "wodona" : "worshiphq",
    sheet: row.sheet === "half" ? "half" : "a4",
    kind: (["manual", "registration", "upgrade", "gift"].includes(row.kind) ? row.kind : "manual") as ReceiptKind,
    number: receiptNumber(row),
    issuedAt: row.issuedAt,
    toName: row.toName, toOrg: row.toOrg, toEmail: row.toEmail, toPhone: row.toPhone, toAddress: row.toAddress,
    currency: row.currency,
    items: itemsOf(row),
    discount: row.discount, paid: row.paid, paidBefore: row.paidBefore, method: row.method, reference: row.reference, notes: row.notes,
    signatureLines: row.signatureLines,
    settings: settings ?? (await getReceiptSettings()),
  };
  if (row.relatedId) {
    const first = await db.receipt.findUnique({ where: { id: row.relatedId }, select: { brand: true, year: true, seq: true } });
    if (first) data.followsNumber = receiptNumber(first);
  }
  if (data.kind === "registration") {
    const { getPlatformConfig } = await import("@/lib/data/platform-config");
    const free = (await getPlatformConfig()).planDefs.free;
    data.welcome = { church: row.toOrg || row.toName, members: free.memberLimit > 0 ? free.memberLimit : null, features: free.marketingFeatures ?? [] };
  }
  return data;
}

export async function pdfForRow(row: Receipt): Promise<Buffer> {
  return Buffer.from(await renderReceiptPdf(await dataFromRow(row)));
}

/* ── emailing ── */

const logoBase = () => env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

function receiptEmailHtml(row: Receipt, data: ReceiptData): string {
  const base = logoBase();
  const settings = data.settings;
  const t = totalsOf(data.items, data.discount, data.paid);
  const number = data.number ?? "";
  const first = row.toName.split(" ")[0] || "there";
  const intro =
    data.kind === "registration"
      ? `Welcome to WorshipHQ. Your free account is ready, and it is free forever. Your welcome receipt is attached as a PDF, for your records.`
      : data.kind === "gift"
        ? `Your plan has been gifted to you. Your receipt is attached as a PDF, for your records.`
        : (data.paidBefore ?? 0) > 0 && t.balance <= 0
          ? `Thank you. Your balance is now fully paid. Your receipt is attached as a PDF, for your records.`
        : t.balance > 0
          ? `Thank you for your payment. Your receipt is attached as a PDF. A balance of ${money(t.balance, data.currency)} is still due.`
          : `Thank you for your payment. Your receipt is attached as a PDF, for your records.`;
  const rows = data.items
    .map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eef0f1;color:#19252f;font-size:14px">${escapeHtml(i.description)}${i.qty !== 1 ? ` <span style="color:#6b7780">x ${i.qty}</span>` : ""}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #eef0f1;color:#19252f;font-size:14px;white-space:nowrap">${escapeHtml(money(round2(i.qty * i.unit), data.currency))}</td></tr>`)
    .join("");
  const contact = data.brand === "worshiphq" ? settings.whqEmail || settings.email : settings.email;
  const foot = [settings.companyName, settings.address, settings.phone, contact].filter(Boolean).map(escapeHtml).join(" | ");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Receipt ${escapeHtml(number)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="padding:22px 28px 18px;border-bottom:3px solid #019a9f"><img src="${base}/brand/wodona-dark.png" width="150" alt="WODONA" style="display:block;height:auto;border:0;font-size:20px;font-weight:700;color:#19252f">${data.brand === "worshiphq" ? `<div style="margin-top:8px;font-size:12px;color:#6b7780">WorshipHQ, a WODONA product</div>` : ""}</td></tr>
<tr><td style="padding:26px 28px 8px">
<p style="margin:0 0 12px;font-size:16px;color:#19252f">Hello ${escapeHtml(first)},</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#33414b">${escapeHtml(intro)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f6;border-radius:12px"><tr><td style="padding:14px 16px">
<div style="font-size:11px;letter-spacing:.08em;color:#8a949b;font-weight:700">RECEIPT ${escapeHtml(number)}</div>
<div style="margin-top:2px;font-size:22px;font-weight:800;color:#19252f">${escapeHtml(data.kind === "registration" ? "Free forever" : money(data.paid, data.currency))}</div>
</td></tr></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px">${rows}</table>
</td></tr>
<tr><td style="padding:14px 28px 26px;font-size:13px;color:#6b7780">Questions about this receipt? Just reply to this email.</td></tr>
<tr><td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280">${foot}</td></tr>
</table></td></tr></table></body></html>`;
}

export type EmailOutcome = { status: "sent" | "failed" | "stubbed"; error?: string };

/** Emails the PDF receipt and records how it went on the receipt. */
export async function emailReceipt(row: Receipt, to: string, opts: { pdf?: Buffer } = {}): Promise<EmailOutcome> {
  const settings = await getReceiptSettings();
  const data = await dataFromRow(row, settings);
  const pdf = opts.pdf ?? Buffer.from(await renderReceiptPdf(data));
  const number = data.number ?? "";
  const subject = data.kind === "registration"
    ? `Welcome to WorshipHQ: your free-forever receipt ${number}`
    : data.brand === "wodona" ? `Receipt ${number} from ${settings.companyName || "WODONA"}` : `Your WorshipHQ receipt ${number}`;
  let outcome: EmailOutcome;
  try {
    const res = await sendEmail({
      to, subject, html: receiptEmailHtml(row, data), replyTo: settings.email || undefined,
      attachments: [{ filename: `Receipt ${number}.pdf`, content: pdf }],
      ...(row.churchId ? { log: { churchId: row.churchId, name: `Receipt ${number}`, segment: "receipt" } } : {}),
    });
    outcome = res.stubbed ? { status: "stubbed" } : res.ok ? { status: "sent" } : { status: "failed", error: res.error ?? "The email provider refused it." };
  } catch (e) {
    outcome = { status: "failed", error: (e as Error).message };
  }
  await db.receipt.update({
    where: { id: row.id },
    data: { emailStatus: outcome.status, emailError: outcome.error ?? null, ...(outcome.status !== "failed" ? { emailedAt: new Date(), toEmail: row.toEmail || to } : {}) },
  });
  return outcome;
}

/* ── the automatic receipts ── */

/** The welcome receipt for a church on the free plan. Made once per church; later calls return the same one. */
export async function issueRegistrationReceipt(churchId: string): Promise<{ row: Receipt; pdf: Buffer } | null> {
  const church = await db.church.findUnique({
    where: { id: churchId },
    select: { id: true, name: true, isDemo: true, createdAt: true, subscription: { select: { plan: true } } },
  });
  if (!church || church.isDemo) return null;
  // A church that is already on a paid plan gets a payment receipt, not a "free forever" one.
  if ((church.subscription?.plan ?? "free") !== "free") return null;
  const owner =
    (await db.user.findFirst({ where: { churchId, role: "Owner" }, orderBy: { createdAt: "asc" }, select: { name: true, email: true, phone: true } })) ??
    (await db.user.findFirst({ where: { churchId, role: "Admin" }, orderBy: { createdAt: "asc" }, select: { name: true, email: true, phone: true } }));
  if (!owner) return null;
  let row = await db.receipt.findFirst({ where: { churchId, kind: "registration" } });
  if (!row) {
    const registered = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Accra" }).format(church.createdAt);
    row = await createReceipt({
      brand: "worshiphq", sheet: "a4", kind: "registration", churchId,
      toName: owner.name || church.name, toOrg: church.name, toEmail: owner.email, toPhone: owner.phone,
      items: [{ description: "WorshipHQ Free plan", detail: `Free forever. Registered on ${registered}.`, qty: 1, unit: 0 }],
      paid: 0, method: null,
    });
  }
  return { row, pdf: await pdfForRow(row) };
}

/** The payment receipt after a plan is switched on (paid, 100% coupon, or gifted). Once per payment reference. */
export async function issueUpgradeReceipt(a: {
  churchId: string; planName: string; interval: string; reference: string;
  /** GHS actually paid. */
  amount: number;
  /** GHS taken off by a coupon. */
  discount?: number;
  from?: Date | null; to?: Date | null;
  kind?: "upgrade" | "gift";
  method?: string;
  prorated?: boolean;
}): Promise<{ row: Receipt; pdf: Buffer } | null> {
  const church = await db.church.findUnique({ where: { id: a.churchId }, select: { id: true, name: true, isDemo: true } });
  if (!church || church.isDemo) return null;
  const owner =
    (await db.user.findFirst({ where: { churchId: a.churchId, role: "Owner" }, orderBy: { createdAt: "asc" }, select: { name: true, email: true, phone: true } })) ??
    (await db.user.findFirst({ where: { churchId: a.churchId, role: "Admin" }, orderBy: { createdAt: "asc" }, select: { name: true, email: true, phone: true } }));
  if (!owner) return null;
  let row = await db.receipt.findFirst({ where: { churchId: a.churchId, reference: a.reference, kind: a.kind ?? "upgrade" } });
  if (!row) {
    const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Accra" }).format(d);
    const period = a.from && a.to ? `, ${day(a.from)} to ${day(a.to)}` : "";
    const cadence = a.interval === "yearly" ? "Yearly" : "Monthly";
    const gift = a.kind === "gift";
    const discount = gift ? 0 : round2(a.discount ?? 0);
    row = await createReceipt({
      brand: "worshiphq", sheet: "a4", kind: a.kind ?? "upgrade", churchId: a.churchId,
      toName: owner.name || church.name, toOrg: church.name, toEmail: owner.email, toPhone: owner.phone,
      items: [{
        description: `WorshipHQ ${a.planName} plan${a.prorated ? " (upgrade, prorated)" : ""}`,
        detail: gift ? "Gifted by WODONA" : `${cadence} subscription${period}`,
        qty: 1, unit: gift ? 0 : round2(a.amount + discount),
      }],
      discount, paid: gift ? 0 : round2(a.amount),
      method: a.method ?? (a.reference.startsWith("COUPON-") ? "Coupon" : gift ? "Gift" : "Paystack (Mobile Money or card)"),
      reference: a.reference,
    });
  }
  return { row, pdf: await pdfForRow(row) };
}
