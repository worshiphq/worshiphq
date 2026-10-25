"use server";

import { revalidatePath } from "next/cache";
import type { Receipt } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { features } from "@/lib/env";
import { ReceiptOverflowError, renderReceiptPdf } from "@/lib/receipts/pdf";
import { dateFromYmd, isEmail, manualReceiptSchema, type ManualReceiptInput } from "@/lib/receipts/input";
import { createReceipt, emailReceipt, getReceiptSettings, itemsOf, pdfForRow, saveReceiptSettings } from "@/lib/receipts/service";
import { receiptNumber, round2, totalsOf, type ReceiptSettings } from "@/lib/receipts/types";

export type ReceiptRow = {
  id: string; number: string; issuedAt: string; kind: string; brand: string; sheet: string;
  toName: string; toOrg: string | null; toEmail: string | null; currency: string;
  total: number; paid: number; paidBefore: number;
  /** What is still owed on this sale (0 when cleared, or when a newer receipt already took the balance). */
  balance: number;
  /** True when this is the latest receipt of its sale and a balance is still owed, so a balance payment can be recorded on it. */
  canPay: boolean;
  /** The number of the first receipt of the sale, when this one follows another. */
  follows: string | null;
  emailStatus: string | null; emailedAt: string | null; emailError: string | null;
};
export type ReceiptChurch = { id: string; name: string; contact: string; email: string; phone: string };
export type ReceiptsPageData = {
  settings: ReceiptSettings;
  churches: ReceiptChurch[];
  receipts: ReceiptRow[];
  emailLive: boolean;
  counts: { registration: number; upgrade: number; manual: number };
};

const toRow = (r: Receipt, ctx: { latestPaid: Map<string, number>; numbers: Map<string, string> }): ReceiptRow => {
  const root = r.relatedId ?? r.id;
  const owes = r.kind === "manual" ? round2(Math.max(r.total - r.paid, 0)) : 0;
  const isLatest = r.paid >= (ctx.latestPaid.get(root) ?? r.paid) - 0.005;
  return {
  id: r.id, number: receiptNumber(r), issuedAt: r.issuedAt.toISOString(), kind: r.kind, brand: r.brand, sheet: r.sheet,
  toName: r.toName, toOrg: r.toOrg, toEmail: r.toEmail, currency: r.currency, total: r.total, paid: r.paid, paidBefore: r.paidBefore,
  balance: isLatest ? owes : 0, canPay: isLatest && owes > 0, follows: r.relatedId ? ctx.numbers.get(r.relatedId) ?? null : null,
  emailStatus: r.emailStatus, emailedAt: r.emailedAt?.toISOString() ?? null, emailError: r.emailError,
  };
};

/** For each sale (the first receipt's id), the most that has been paid on it, and the numbers of the first receipts. */
async function chainContext(rows: Receipt[]) {
  const roots = [...new Set(rows.map((r) => r.relatedId ?? r.id))];
  const [chain, firsts] = await Promise.all([
    db.receipt.findMany({ where: { OR: [{ id: { in: roots } }, { relatedId: { in: roots } }] }, select: { id: true, relatedId: true, paid: true } }),
    db.receipt.findMany({ where: { id: { in: roots } }, select: { id: true, brand: true, year: true, seq: true } }),
  ]);
  const latestPaid = new Map<string, number>();
  for (const c of chain) {
    const root = c.relatedId ?? c.id;
    latestPaid.set(root, Math.max(latestPaid.get(root) ?? 0, c.paid));
  }
  return { latestPaid, numbers: new Map(firsts.map((f) => [f.id, receiptNumber(f)])) };
}

/** Everything the Receipts page shows: the company details, churches to pick from, and the latest receipts. */
export async function getReceiptsPage(): Promise<ReceiptsPageData> {
  await requireSuperAdmin();
  const [settings, churches, receipts, groups] = await Promise.all([
    getReceiptSettings(),
    db.church.findMany({
      where: { isDemo: false },
      orderBy: { name: "asc" },
      take: 600,
      select: { id: true, name: true, users: { where: { role: { in: ["Owner", "Admin"] } }, orderBy: { createdAt: "asc" }, take: 1, select: { name: true, email: true, phone: true } } },
    }),
    db.receipt.findMany({ orderBy: { createdAt: "desc" }, take: 80 }),
    db.receipt.groupBy({ by: ["kind"], _count: { _all: true } }),
  ]);
  const ctx = await chainContext(receipts);
  const n = (k: string) => groups.find((g) => g.kind === k)?._count._all ?? 0;
  return {
    settings,
    emailLive: features.email,
    churches: churches.map((c) => ({ id: c.id, name: c.name, contact: c.users[0]?.name ?? "", email: c.users[0]?.email ?? "", phone: c.users[0]?.phone ?? "" })),
    receipts: receipts.map((r) => toRow(r, ctx)),
    counts: { registration: n("registration"), upgrade: n("upgrade") + n("gift"), manual: n("manual") },
  };
}

export async function saveReceiptDetails(input: Partial<ReceiptSettings>): Promise<{ ok: true; settings: ReceiptSettings } | { ok: false; error: string }> {
  await requireSuperAdmin();
  try {
    return { ok: true, settings: await saveReceiptSettings(input) };
  } catch {
    return { ok: false, error: "Could not save. Please try again." };
  }
}

export type CreateReceiptResult =
  | { ok: true; id: string; number: string; email: "sent" | "stubbed" | "failed" | "none"; emailError?: string }
  | { ok: false; error: string };

/** Makes a receipt by hand. With an email address it is sent as a PDF straight away; either way it can be downloaded. */
export async function createManualReceipt(input: ManualReceiptInput, sendTo?: string): Promise<CreateReceiptResult> {
  await requireSuperAdmin();
  const parsed = manualReceiptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the receipt." };
  const r = parsed.data;
  const to = (sendTo ?? "").trim();
  if (to && !isEmail(to)) return { ok: false, error: "That email address does not look right." };

  const t = totalsOf(r.items, r.discount, r.paid);
  if (r.paid > t.total + 0.005) return { ok: false, error: "The amount paid is more than the total." };
  if (t.total > 0 && r.paid <= 0) return { ok: false, error: "Enter the amount paid. For a part payment, enter what was paid so far." };

  // Draw it first: if it does not fit its sheet, nothing is saved and nothing is sent.
  const settings = await getReceiptSettings();
  try {
    await renderReceiptPdf({
      brand: r.brand, sheet: r.sheet, kind: "manual", number: "CHECK", issuedAt: dateFromYmd(r.issuedOn),
      toName: r.toName, toOrg: r.toOrg, toEmail: r.toEmail, toPhone: r.toPhone, toAddress: r.toAddress, currency: r.currency,
      items: r.items, discount: r.discount, paid: r.paid, method: r.method, reference: r.reference, notes: r.notes, signatureLines: r.signatureLines, settings,
    });
  } catch (e) {
    if (e instanceof ReceiptOverflowError) return { ok: false, error: e.message };
    throw e;
  }

  let churchId: string | null = null;
  if (r.churchId) churchId = (await db.church.findUnique({ where: { id: r.churchId }, select: { id: true } }))?.id ?? null;

  const row = await createReceipt({
    brand: r.brand, sheet: r.sheet, kind: "manual", churchId,
    toName: r.toName, toOrg: r.toOrg, toEmail: to || r.toEmail, toPhone: r.toPhone, toAddress: r.toAddress,
    currency: r.currency, items: r.items, discount: r.discount, paid: r.paid,
    method: r.method, reference: r.reference, notes: r.notes, signatureLines: r.signatureLines, issuedAt: dateFromYmd(r.issuedOn),
  });
  revalidatePath("/admin/receipts");

  if (!to) return { ok: true, id: row.id, number: receiptNumber(row), email: "none" };
  const out = await emailReceipt(row, to);
  return { ok: true, id: row.id, number: receiptNumber(row), email: out.status, emailError: out.error };
}

/** Send an existing receipt (again) to an email address. */
export async function sendReceiptEmail(id: string, to: string): Promise<{ ok: true; status: "sent" | "stubbed" } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const address = to.trim();
  if (!isEmail(address)) return { ok: false, error: "That email address does not look right." };
  const row = await db.receipt.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "That receipt was not found." };
  const out = await emailReceipt(row, address, { pdf: await pdfForRow(row) });
  revalidatePath("/admin/receipts");
  return out.status === "failed" ? { ok: false, error: out.error ?? "The email provider refused it." } : { ok: true, status: out.status };
}

/**
 * Records a payment on a balance that was left on an earlier receipt, and makes a new receipt for it. The new
 * receipt repeats the same lines, shows what was paid earlier and this payment, and says "Paid in full" when it clears the balance.
 */
export async function payReceiptBalance(input: { id: string; amount: number; method?: string; reference?: string; issuedOn?: string; sendTo?: string }): Promise<CreateReceiptResult> {
  await requireSuperAdmin();
  const prev = await db.receipt.findUnique({ where: { id: input.id } });
  if (!prev || prev.kind !== "manual") return { ok: false, error: "That receipt was not found." };
  const root = prev.relatedId ?? prev.id;
  const newest = await db.receipt.findFirst({ where: { OR: [{ id: root }, { relatedId: root }] }, orderBy: { paid: "desc" }, select: { id: true, paid: true } });
  if (newest && newest.paid > prev.paid + 0.005) return { ok: false, error: "A newer receipt already took payments on this sale. Use the newest one." };
  const owes = round2(Math.max(prev.total - prev.paid, 0));
  if (owes <= 0) return { ok: false, error: "Nothing is owed on that receipt." };
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter the amount they are paying now." };
  if (amount > owes + 0.005) return { ok: false, error: `That is more than the balance (${owes.toFixed(2)}).` };
  const to = (input.sendTo ?? "").trim();
  if (to && !isEmail(to)) return { ok: false, error: "That email address does not look right." };

  const row = await createReceipt({
    brand: prev.brand === "wodona" ? "wodona" : "worshiphq", sheet: prev.sheet === "half" ? "half" : "a4", kind: "manual", churchId: prev.churchId,
    toName: prev.toName, toOrg: prev.toOrg, toEmail: to || prev.toEmail, toPhone: prev.toPhone, toAddress: prev.toAddress,
    currency: prev.currency, items: itemsOf(prev), discount: prev.discount, paid: round2(prev.paid + amount), paidBefore: prev.paid, relatedId: root,
    method: input.method ?? prev.method, reference: input.reference ?? null, notes: prev.notes, issuedAt: dateFromYmd(input.issuedOn),
  });
  revalidatePath("/admin/receipts");
  if (!to) return { ok: true, id: row.id, number: receiptNumber(row), email: "none" };
  const out = await emailReceipt(row, to);
  return { ok: true, id: row.id, number: receiptNumber(row), email: out.status, emailError: out.error };
}
