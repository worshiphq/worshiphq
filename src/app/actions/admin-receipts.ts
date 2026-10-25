"use server";

import { revalidatePath } from "next/cache";
import type { Receipt } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { features } from "@/lib/env";
import { ReceiptOverflowError, renderReceiptPdf } from "@/lib/receipts/pdf";
import { dateFromYmd, isEmail, manualReceiptSchema, type ManualReceiptInput } from "@/lib/receipts/input";
import { createReceipt, emailReceipt, getReceiptSettings, pdfForRow, saveReceiptSettings } from "@/lib/receipts/service";
import { receiptNumber, totalsOf, type ReceiptSettings } from "@/lib/receipts/types";

export type ReceiptRow = {
  id: string; number: string; issuedAt: string; kind: string; brand: string; sheet: string;
  toName: string; toOrg: string | null; toEmail: string | null; currency: string;
  total: number; paid: number; emailStatus: string | null; emailedAt: string | null; emailError: string | null;
};
export type ReceiptChurch = { id: string; name: string; contact: string; email: string; phone: string };
export type ReceiptsPageData = {
  settings: ReceiptSettings;
  churches: ReceiptChurch[];
  receipts: ReceiptRow[];
  emailLive: boolean;
  counts: { registration: number; upgrade: number; manual: number };
};

const toRow = (r: Receipt): ReceiptRow => ({
  id: r.id, number: receiptNumber(r), issuedAt: r.issuedAt.toISOString(), kind: r.kind, brand: r.brand, sheet: r.sheet,
  toName: r.toName, toOrg: r.toOrg, toEmail: r.toEmail, currency: r.currency, total: r.total, paid: r.paid,
  emailStatus: r.emailStatus, emailedAt: r.emailedAt?.toISOString() ?? null, emailError: r.emailError,
});

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
  const n = (k: string) => groups.find((g) => g.kind === k)?._count._all ?? 0;
  return {
    settings,
    emailLive: features.email,
    churches: churches.map((c) => ({ id: c.id, name: c.name, contact: c.users[0]?.name ?? "", email: c.users[0]?.email ?? "", phone: c.users[0]?.phone ?? "" })),
    receipts: receipts.map(toRow),
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
