"use server";

import { revalidatePath } from "next/cache";
import type { Prisma, Receipt } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { features } from "@/lib/env";
import { ReceiptOverflowError, renderReceiptPdf } from "@/lib/receipts/pdf";
import { dateFromYmd, isEmail, manualReceiptSchema, type ManualReceiptInput } from "@/lib/receipts/input";
import { createReceipt, emailReceipt, getReceiptSettings, itemsOf, pdfForRow, saveReceiptSettings } from "@/lib/receipts/service";
import { money, receiptNumber, round2, totalsOf, type ReceiptSettings } from "@/lib/receipts/types";

export type ReceiptRow = {
  id: string; number: string; issuedAt: string; kind: string; brand: string; sheet: string;
  toName: string; toOrg: string | null; toEmail: string | null; toPhone: string | null; toAddress: string | null; currency: string;
  items: { description: string; detail?: string; qty: number; unit: number }[];
  discount: number; method: string | null; reference: string | null; notes: string | null;
  total: number; paid: number; paidBefore: number;
  /** What is still owed on this sale (0 when cleared, or when a newer receipt already took the balance). */
  balance: number;
  /** True when this is the latest receipt of its sale and a balance is still owed, so a balance payment can be recorded on it. */
  canPay: boolean;
  /** The number of the first receipt of the sale, when this one follows another. */
  follows: string | null;
  /** full = everything can be edited; basic = who, date, how paid, reference and note (amounts are tied to other records); none = locked. */
  editable: "full" | "basic" | "none";
  editCount: number; lastEditedAt: string | null;
  emailStatus: string | null; emailedAt: string | null; emailError: string | null;
};
export type ReceiptPerson = { name: string; role: string; email: string; phone: string };
export type ReceiptChurch = { id: string; name: string; contact: string; email: string; phone: string; people: ReceiptPerson[] };
export type ReceiptList = { rows: ReceiptRow[]; total: number; page: number; pages: number; receivedGhs: number };
export type ReceiptsPageData = {
  settings: ReceiptSettings;
  churches: ReceiptChurch[];
  list: ReceiptList;
  emailLive: boolean;
  counts: { registration: number; upgrade: number; manual: number };
};

const PAGE_SIZE = 20;

type RowCtx = { latestPaid: Map<string, number>; numbers: Map<string, string>; hasFollower: Set<string>; edits: Map<string, { n: number; at: Date }> };

const toRow = (r: Receipt, ctx: RowCtx): ReceiptRow => {
  const root = r.relatedId ?? r.id;
  const owes = r.kind === "manual" || r.kind === "upgrade" ? round2(Math.max(r.total - r.paid, 0)) : 0;
  const isLatest = r.paid >= (ctx.latestPaid.get(root) ?? r.paid) - 0.005;
  const chained = !!r.relatedId || ctx.hasFollower.has(r.id);
  const edit = ctx.edits.get(r.id);
  return {
    id: r.id, number: receiptNumber(r), issuedAt: r.issuedAt.toISOString(), kind: r.kind, brand: r.brand, sheet: r.sheet,
    toName: r.toName, toOrg: r.toOrg, toEmail: r.toEmail, toPhone: r.toPhone, toAddress: r.toAddress, currency: r.currency,
    items: itemsOf(r), discount: r.discount, method: r.method, reference: r.reference, notes: r.notes,
    total: r.total, paid: r.paid, paidBefore: r.paidBefore,
    balance: isLatest ? owes : 0, canPay: isLatest && owes > 0, follows: r.relatedId ? ctx.numbers.get(r.relatedId) ?? null : null,
    editable: r.kind === "registration" ? "none" : r.kind === "manual" && !chained ? "full" : "basic",
    editCount: edit?.n ?? 0, lastEditedAt: edit?.at.toISOString() ?? null,
    emailStatus: r.emailStatus, emailedAt: r.emailedAt?.toISOString() ?? null, emailError: r.emailError,
  };
};

/** What the rows need to know about the other receipts and edits around them. */
async function rowContext(rows: Receipt[]): Promise<RowCtx> {
  const roots = [...new Set(rows.map((r) => r.relatedId ?? r.id))];
  const [chain, firsts, edits] = await Promise.all([
    db.receipt.findMany({ where: { OR: [{ id: { in: roots } }, { relatedId: { in: roots } }] }, select: { id: true, relatedId: true, paid: true } }),
    db.receipt.findMany({ where: { id: { in: roots } }, select: { id: true, brand: true, year: true, seq: true } }),
    db.receiptRevision.groupBy({ by: ["receiptId"], where: { receiptId: { in: rows.map((r) => r.id) } }, _count: { _all: true }, _max: { createdAt: true } }),
  ]);
  const latestPaid = new Map<string, number>();
  const hasFollower = new Set<string>();
  for (const c of chain) {
    const root = c.relatedId ?? c.id;
    latestPaid.set(root, Math.max(latestPaid.get(root) ?? 0, c.paid));
    if (c.relatedId) hasFollower.add(c.relatedId);
  }
  return {
    latestPaid, hasFollower,
    numbers: new Map(firsts.map((f) => [f.id, receiptNumber(f)])),
    edits: new Map(edits.map((e) => [e.receiptId, { n: e._count._all, at: e._max.createdAt ?? new Date(0) }])),
  };
}

export type ReceiptFilter = { from?: string; to?: string; q?: string; page?: number };

/** One page of receipts for the chosen dates (and name or number), newest first, with how much was received in that range. */
export async function listReceipts(filter: ReceiptFilter = {}): Promise<ReceiptList> {
  await requireSuperAdmin();
  const and: Prisma.ReceiptWhereInput[] = [];
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (filter.from && ymd.test(filter.from)) and.push({ issuedAt: { gte: new Date(`${filter.from}T00:00:00Z`) } });
  if (filter.to && ymd.test(filter.to)) and.push({ issuedAt: { lte: new Date(`${filter.to}T23:59:59.999Z`) } });
  const q = (filter.q ?? "").trim().slice(0, 80);
  if (q) {
    const num = /^(WHQ|WOD)-(\d{4})-(\d{1,6})$/i.exec(q);
    and.push(num
      ? { brand: num[1].toUpperCase() === "WOD" ? "wodona" : "worshiphq", year: Number(num[2]), seq: Number(num[3]) }
      : { OR: [{ toName: { contains: q, mode: "insensitive" } }, { toOrg: { contains: q, mode: "insensitive" } }, { toEmail: { contains: q, mode: "insensitive" } }, { reference: { contains: q, mode: "insensitive" } }] });
  }
  const where: Prisma.ReceiptWhereInput = and.length ? { AND: and } : {};
  const total = await db.receipt.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(Math.floor(filter.page ?? 1), 1), pages);
  const [rows, sums] = await Promise.all([
    db.receipt.findMany({ where, orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.receipt.aggregate({ where: { AND: [where, { currency: "GHS" }, { kind: { notIn: ["registration", "gift"] } }] }, _sum: { paid: true, paidBefore: true } }),
  ]);
  const ctx = await rowContext(rows);
  return { rows: rows.map((r) => toRow(r, ctx)), total, page, pages, receivedGhs: round2((sums._sum.paid ?? 0) - (sums._sum.paidBefore ?? 0)) };
}

/** Everything the Receipts page shows: the company details, churches to pick from, and the latest receipts. */
export async function getReceiptsPage(): Promise<ReceiptsPageData> {
  await requireSuperAdmin();
  const [settings, churches, list, groups] = await Promise.all([
    getReceiptSettings(),
    db.church.findMany({
      where: { isDemo: false },
      orderBy: { name: "asc" },
      take: 600,
      select: { id: true, name: true, users: { orderBy: { createdAt: "asc" }, take: 40, select: { name: true, role: true, email: true, phone: true } } },
    }),
    listReceipts({}),
    db.receipt.groupBy({ by: ["kind"], _count: { _all: true } }),
  ]);
  const n = (k: string) => groups.find((g) => g.kind === k)?._count._all ?? 0;
  return {
    settings,
    emailLive: features.email,
    churches: churches.map((c) => {
      const rank = (r: string) => (r === "Owner" ? 0 : r === "Admin" ? 1 : 2);
      const people = [...c.users].sort((a, b) => rank(a.role) - rank(b.role)).map((u) => ({ name: u.name ?? "", role: u.role, email: u.email ?? "", phone: u.phone ?? "" }));
      return { id: c.id, name: c.name, contact: people[0]?.name ?? "", email: people[0]?.email ?? "", phone: people[0]?.phone ?? "", people };
    }),
    list,
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
  if (!prev || (prev.kind !== "manual" && prev.kind !== "upgrade")) return { ok: false, error: "That receipt was not found." };
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

  // A balance on a church's plan is also money received: write it into their billing history and Revenue.
  let reference = input.reference ?? null;
  if (prev.kind === "upgrade") {
    if (!prev.churchId) return { ok: false, error: "That receipt is not linked to a church." };
    const first = await db.receipt.findUnique({ where: { id: root }, select: { reference: true } });
    const original = first?.reference ? await db.planPayment.findUnique({ where: { reference: first.reference } }) : null;
    if (!original) return { ok: false, error: "The original payment for this plan was not found." };
    const rate = original.usdToGhsRate || 12;
    reference = `OFFLINE-BAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await db.planPayment.create({
      data: {
        churchId: prev.churchId, reference, plan: original.plan, interval: original.interval, amountUsd: amount / rate, amountGhs: amount, usdToGhsRate: rate,
        kind: "balance", periodStart: original.periodStart, periodEnd: original.periodEnd, source: "offline", termMonths: 0,
        note: [input.method ? `Paid by ${input.method}` : "Paid outside the app", `Balance payment towards ${receiptNumber(prev)}`].join(". "),
      },
    });
    revalidatePath("/admin/revenue");
  }

  const row = await createReceipt({
    brand: prev.brand === "wodona" ? "wodona" : "worshiphq", sheet: prev.sheet === "half" ? "half" : "a4", kind: prev.kind === "upgrade" ? "upgrade" : "manual", churchId: prev.churchId,
    toName: prev.toName, toOrg: prev.toOrg, toEmail: to || prev.toEmail, toPhone: prev.toPhone, toAddress: prev.toAddress,
    currency: prev.currency, items: itemsOf(prev), discount: prev.discount, paid: round2(prev.paid + amount), paidBefore: prev.paid, relatedId: root,
    method: input.method ?? prev.method, reference, notes: prev.notes, issuedAt: dateFromYmd(input.issuedOn),
  });
  revalidatePath("/admin/receipts");
  if (!to) return { ok: true, id: row.id, number: receiptNumber(row), email: "none" };
  const out = await emailReceipt(row, to);
  return { ok: true, id: row.id, number: receiptNumber(row), email: out.status, emailError: out.error };
}

/* ── editing a receipt, with its history ── */

type Change = { label: string; from: string; to: string };
type Snapshot = {
  toName: string; toOrg: string | null; toEmail: string | null; toPhone: string | null; toAddress: string | null; currency: string;
  items: { description: string; detail?: string; qty: number; unit: number }[]; discount: number; total: number; paid: number; paidBefore: number;
  method: string | null; reference: string | null; notes: string | null; sheet: string; issuedAt: string;
};

const snapshotOf = (r: Receipt): Snapshot => ({
  toName: r.toName, toOrg: r.toOrg, toEmail: r.toEmail, toPhone: r.toPhone, toAddress: r.toAddress, currency: r.currency,
  items: itemsOf(r), discount: r.discount, total: r.total, paid: r.paid, paidBefore: r.paidBefore,
  method: r.method, reference: r.reference, notes: r.notes, sheet: r.sheet, issuedAt: r.issuedAt.toISOString(),
});

const linesLabel = (items: Snapshot["items"], currency: string) => items.map((i) => `${i.description}${i.qty !== 1 ? ` x${i.qty}` : ""} ${money(round2(i.qty * i.unit), currency)}`).join("; ") || "none";
const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" }).format(new Date(iso));

export type EditReceiptInput = {
  toName: string; toOrg?: string; toEmail?: string; toPhone?: string; toAddress?: string;
  issuedOn: string; method?: string; reference?: string; notes?: string; sheet?: "a4" | "half";
  /** Only for a receipt that stands alone (not part of a part-payment chain and not made by the system). */
  items?: { description: string; detail?: string; qty: number; unit: number }[];
  discount?: number; paid?: number;
};

/**
 * Corrects a saved receipt. It keeps its number. What it looked like before is saved as a revision, so every change can be
 * seen later and the earlier version can be opened. When a receipt for a church's plan gets a new date, the payment in their
 * billing history moves to that date too, so Revenue and the receipt agree.
 */
export async function editReceipt(id: string, input: EditReceiptInput): Promise<{ ok: true; number: string; changed: number } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const row = await db.receipt.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "That receipt was not found." };
  if (row.kind === "registration") return { ok: false, error: "Welcome receipts cannot be edited." };
  const chained = !!row.relatedId || !!(await db.receipt.findFirst({ where: { relatedId: row.id }, select: { id: true } }));
  const full = row.kind === "manual" && !chained;

  const toName = (input.toName ?? "").trim().slice(0, 120);
  if (!toName) return { ok: false, error: "Who is the receipt for? Add a name." };
  const email = (input.toEmail ?? "").trim();
  if (email && !isEmail(email)) return { ok: false, error: "That email address does not look right." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issuedOn ?? "")) return { ok: false, error: "Choose a valid date." };
  const issuedAt = dateFromYmd(input.issuedOn);
  const orNull = (v: string | undefined, max: number) => { const t = (v ?? "").trim().slice(0, max); return t || null; };

  let items = itemsOf(row), discount = row.discount, paid = row.paid;
  if (full && input.items) {
    const parsed = manualReceiptSchema.shape.items.safeParse(input.items);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the lines." };
    items = parsed.data.map((i) => ({ description: i.description, ...(i.detail ? { detail: i.detail } : {}), qty: i.qty, unit: round2(i.unit) }));
    discount = round2(Math.max(Number(input.discount) || 0, 0));
    paid = round2(Math.max(Number(input.paid) || 0, 0));
    const t = totalsOf(items, discount, paid);
    if (paid > t.total + 0.005) return { ok: false, error: "The amount paid is more than the total." };
    if (t.total > 0 && paid <= 0) return { ok: false, error: "Enter the amount paid." };
  }
  const totals = totalsOf(items, discount, paid);

  const before = snapshotOf(row);
  const next: Snapshot = {
    ...before,
    toName, toOrg: orNull(input.toOrg, 160), toEmail: email || null, toPhone: orNull(input.toPhone, 40), toAddress: orNull(input.toAddress, 240),
    method: orNull(input.method, 60),
    // On a receipt for a church's plan the reference is what ties it to their billing history, so it stays as it is.
    reference: row.kind === "manual" ? orNull(input.reference, 120) : row.reference,
    notes: orNull(input.notes, 1200),
    sheet: input.sheet === "half" ? "half" : input.sheet === "a4" ? "a4" : before.sheet,
    issuedAt: issuedAt.toISOString(),
    items, discount: totals.discount, total: totals.total, paid,
  };

  const changes: Change[] = [];
  const diff = (label: string, a: unknown, b: unknown, show: (v: unknown) => string = (v) => (v == null || v === "" ? "empty" : String(v))) => {
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) changes.push({ label, from: show(a), to: show(b) });
  };
  diff("Received from", before.toName, next.toName);
  diff("Church or company", before.toOrg, next.toOrg);
  diff("Email", before.toEmail, next.toEmail);
  diff("Phone", before.toPhone, next.toPhone);
  diff("Address", before.toAddress, next.toAddress);
  if (dateFromYmd(input.issuedOn).toISOString().slice(0, 10) !== before.issuedAt.slice(0, 10)) changes.push({ label: "Date", from: dayLabel(before.issuedAt), to: dayLabel(next.issuedAt) });
  diff("Paid by", before.method, next.method);
  diff("Reference", before.reference, next.reference);
  diff("Note", before.notes, next.notes);
  diff("Sheet", before.sheet, next.sheet, (v) => (v === "half" ? "half A4" : "full A4"));
  if (full) {
    diff("Lines", before.items, next.items, (v) => linesLabel(v as Snapshot["items"], row.currency));
    diff("Discount", before.discount, next.discount, (v) => money(Number(v), row.currency));
    diff("Amount paid", before.paid, next.paid, (v) => money(Number(v), row.currency));
  }
  if (!changes.length) return { ok: false, error: "Nothing was changed." };

  // Draw it first: if it does not fit its sheet, nothing is saved.
  const settings = await getReceiptSettings();
  try {
    await renderReceiptPdf({
      brand: row.brand === "wodona" ? "wodona" : "worshiphq", sheet: next.sheet === "half" ? "half" : "a4", kind: row.kind === "manual" ? "manual" : (row.kind as "upgrade" | "gift"), number: receiptNumber(row), issuedAt,
      toName: next.toName, toOrg: next.toOrg, toEmail: next.toEmail, toPhone: next.toPhone, toAddress: next.toAddress, currency: row.currency,
      items, discount: next.discount, paid, paidBefore: row.paidBefore, method: next.method, reference: next.reference, notes: next.notes, settings,
    });
  } catch (e) {
    if (e instanceof ReceiptOverflowError) return { ok: false, error: e.message };
    throw e;
  }

  const lastRev = await db.receiptRevision.findFirst({ where: { receiptId: id }, orderBy: { n: "desc" }, select: { n: true } });
  await db.$transaction(async (tx) => {
    await tx.receiptRevision.create({ data: { receiptId: id, n: (lastRev?.n ?? 0) + 1, before, changes } });
    await tx.receipt.update({
      where: { id },
      data: {
        toName: next.toName, toOrg: next.toOrg, toEmail: next.toEmail, toPhone: next.toPhone, toAddress: next.toAddress,
        method: next.method, reference: next.reference, notes: next.notes, sheet: next.sheet, issuedAt,
        ...(full ? { items, discount: next.discount, total: next.total, paid } : {}),
      },
    });
    // The payment this receipt is for (a church's plan) moves to the same day, so Revenue and the receipt agree.
    if (before.issuedAt.slice(0, 10) !== next.issuedAt.slice(0, 10) && row.churchId && row.reference && row.kind === "upgrade") {
      await tx.planPayment.updateMany({ where: { reference: before.reference ?? row.reference, churchId: row.churchId }, data: { paidAt: issuedAt } });
    }
    // Who it is made out to is the same for every receipt of one sale.
    const contact = changes.some((c) => ["Received from", "Church or company", "Email", "Phone", "Address"].includes(c.label));
    if (contact && chained) {
      const root = row.relatedId ?? row.id;
      const siblings = await tx.receipt.findMany({ where: { OR: [{ id: root }, { relatedId: root }], NOT: { id } } });
      for (const sib of siblings) {
        const sibBefore = snapshotOf(sib);
        const sibChanges = changes.filter((c) => ["Received from", "Church or company", "Email", "Phone", "Address"].includes(c.label));
        const sibLast = await tx.receiptRevision.findFirst({ where: { receiptId: sib.id }, orderBy: { n: "desc" }, select: { n: true } });
        await tx.receiptRevision.create({ data: { receiptId: sib.id, n: (sibLast?.n ?? 0) + 1, before: sibBefore, changes: sibChanges } });
        await tx.receipt.update({ where: { id: sib.id }, data: { toName: next.toName, toOrg: next.toOrg, toEmail: next.toEmail, toPhone: next.toPhone, toAddress: next.toAddress } });
      }
    }
  });
  revalidatePath("/admin/receipts");
  revalidatePath("/admin/revenue");
  return { ok: true, number: receiptNumber(row), changed: changes.length };
}

export type ReceiptRevisionView = { id: string; n: number; at: string; changes: Change[] };

/** The edits made to a receipt, newest first. Each one keeps the earlier version, which can be opened as a PDF. */
export async function getReceiptHistory(id: string): Promise<ReceiptRevisionView[]> {
  await requireSuperAdmin();
  const revs = await db.receiptRevision.findMany({ where: { receiptId: id }, orderBy: { n: "desc" }, take: 50 });
  return revs.map((r) => ({ id: r.id, n: r.n, at: r.createdAt.toISOString(), changes: Array.isArray(r.changes) ? (r.changes as Change[]) : [] }));
}
