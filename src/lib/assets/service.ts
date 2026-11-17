import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ownedId } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { resolveAccountId } from "@/lib/data/accounts";
import { formatTag } from "@/lib/assets/tag";
import { CATEGORY_KEYS, CONDITION_KEYS, STATUS_KEYS, DISPOSAL_KEYS } from "@/lib/assets/categories";
import { postExpense, round2, safeRevalidate, type Ctx } from "@/lib/expenses/post";

export type Result = { ok: true; id: string } | { ok: false; error: string };

/** The next asset number for a church, taken atomically so two people adding at once never share a tag. */
export async function nextTag(churchId: string, tx: Prisma.TransactionClient | typeof db = db): Promise<string> {
  const rows = await tx.$queryRaw<{ assetTagSeq: number }[]>`UPDATE "Church" SET "assetTagSeq" = "assetTagSeq" + 1 WHERE "id" = ${churchId} RETURNING "assetTagSeq"`;
  if (!rows[0]) throw new Error("Church not found");
  return formatTag(Number(rows[0].assetTagSeq));
}

export type AssetInput = {
  id?: string | null;
  name: string;
  category?: string | null;
  condition?: string | null;
  status?: string | null;
  quantity?: number | null;
  serialNo?: string | null;
  location?: string | null;
  facilityId?: string | null;
  departmentId?: string | null;
  custodianId?: string | null;
  purchaseDate?: Date | null;
  purchasePrice?: number | null;
  supplier?: string | null;
  warrantyExpires?: Date | null;
  depreciation?: string | null;
  usefulLifeYears?: number | null;
  salvageValue?: number | null;
  inServiceDate?: Date | null;
  notes?: string | null;
  /** undefined = leave the photo alone; null = remove it. Already stored (URL), never a data URL here. */
  photoUrl?: string | null;
  /** Also record the purchase as an expense (only once per asset). */
  recordExpense?: { accountId?: string | null; paymentMethod?: string | null } | null;
};

const validDate = (d: Date | null | undefined) => (d && !Number.isNaN(d.getTime()) ? d : null);

export async function saveAsset(ctx: Ctx, input: AssetInput): Promise<Result> {
  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!name) return { ok: false, error: "Give the item a name." };
  const [facilityId, departmentId, custodianId] = await Promise.all([
    ownedId("facility", input.facilityId, ctx.churchId),
    ownedId("department", input.departmentId, ctx.churchId),
    ownedId("person", input.custodianId, ctx.churchId),
  ]);
  if (input.facilityId && !facilityId) return { ok: false, error: "That room was not found." };
  if (input.departmentId && !departmentId) return { ok: false, error: "That department was not found." };
  if (input.custodianId && !custodianId) return { ok: false, error: "That person was not found." };

  const price = input.purchasePrice != null && Number.isFinite(input.purchasePrice) && input.purchasePrice > 0 ? round2(input.purchasePrice) : null;
  const straight = input.depreciation === "straight-line";
  const life = straight && input.usefulLifeYears && input.usefulLifeYears > 0 ? Math.min(100, Math.round(input.usefulLifeYears)) : null;
  if (straight && !life) return { ok: false, error: "Say how many years it will be useful for." };
  const salvage = straight && input.salvageValue != null && input.salvageValue >= 0 ? round2(Math.min(input.salvageValue, price ?? 0)) : null;

  const data = {
    name,
    category: input.category && CATEGORY_KEYS.includes(input.category) ? input.category : "general",
    condition: input.condition && CONDITION_KEYS.includes(input.condition) ? input.condition : "good",
    quantity: Math.max(1, Math.min(100000, Math.round(Number(input.quantity) || 1))),
    serialNo: input.serialNo?.trim() || null,
    location: input.location?.trim() || null,
    facilityId,
    departmentId,
    custodianId,
    purchaseDate: validDate(input.purchaseDate),
    purchasePrice: price,
    supplier: input.supplier?.trim() || null,
    warrantyExpires: validDate(input.warrantyExpires),
    depreciation: straight ? "straight-line" : "none",
    usefulLifeYears: life,
    salvageValue: salvage,
    inServiceDate: validDate(input.inServiceDate) ?? validDate(input.purchaseDate),
    notes: input.notes?.trim() || null,
    ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
  };

  let id: string;
  if (input.id) {
    const existing = await db.asset.findFirst({ where: { id: input.id, churchId: ctx.churchId }, select: { id: true, status: true, tagCode: true } });
    if (!existing) return { ok: false, error: "That item was not found." };
    // Status moves through check-out, return and disposal; the form may only switch between the everyday ones.
    const status = input.status && ["in-service", "in-repair", "in-storage", "lost"].includes(input.status) && !["checked-out", "disposed"].includes(existing.status) ? input.status : undefined;
    await db.asset.update({ where: { id: existing.id }, data: { ...data, ...(status ? { status } : {}), ...(existing.tagCode ? {} : { tagCode: await nextTag(ctx.churchId) }) } });
    id = existing.id;
    await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "update", entity: "asset", entityId: id, detail: `Updated asset "${name}"` });
  } else {
    const created = await db.$transaction(async (tx) => {
      const tagCode = await nextTag(ctx.churchId, tx);
      const status = input.status && STATUS_KEYS.includes(input.status) && !["checked-out", "disposed"].includes(input.status) ? input.status : "in-service";
      return tx.asset.create({ data: { churchId: ctx.churchId, ...data, status, tagCode }, select: { id: true, tagCode: true } });
    });
    id = created.id;
    await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "create", entity: "asset", entityId: id, detail: `Added asset "${name}" (${created.tagCode})` });
  }

  // The purchase as an expense: once per asset, never again when the asset is edited.
  if (input.recordExpense && price && ctx.canPostExpenses) {
    const already = await db.expense.findFirst({ where: { churchId: ctx.churchId, assetId: id, source: "asset" }, select: { id: true } });
    if (!already) {
      const qty = data.quantity;
      const res = await postExpense(ctx, {
        description: `Bought: ${name}${qty > 1 ? ` x${qty}` : ""}`,
        amount: round2(price * qty),
        category: "Equipment",
        vendor: data.supplier,
        accountId: input.recordExpense.accountId,
        paymentMethod: input.recordExpense.paymentMethod,
        date: data.purchaseDate ?? new Date(),
        assetId: id,
        source: "asset",
        sourceId: id,
      });
      if (!res.ok) return { ok: false, error: `The item was saved, but the expense was not: ${res.error}` };
    }
  }
  safeRevalidate("/app/assets", `/app/assets/${id}`);
  return { ok: true, id };
}

export type CheckOutInput = {
  assetId: string;
  personId?: string | null;
  borrowerName?: string | null;
  borrowerPhone?: string | null;
  purpose?: string | null;
  dueAt?: Date | null;
  conditionOut?: string | null;
  note?: string | null;
};

export async function checkOut(ctx: Ctx, input: CheckOutInput): Promise<Result> {
  const asset = await db.asset.findFirst({ where: { id: input.assetId, churchId: ctx.churchId }, select: { id: true, name: true, status: true, condition: true } });
  if (!asset) return { ok: false, error: "That item was not found." };
  if (asset.status === "disposed") return { ok: false, error: "This item has been disposed of." };
  let borrowerName = input.borrowerName?.trim() || "";
  let borrowerPhone = input.borrowerPhone?.trim() || null;
  let personId: string | null = null;
  if (input.personId) {
    const p = await db.person.findFirst({ where: { id: input.personId, churchId: ctx.churchId }, select: { id: true, firstName: true, lastName: true, phone: true } });
    if (!p) return { ok: false, error: "That person was not found." };
    personId = p.id;
    borrowerName = `${p.firstName} ${p.lastName}`.trim();
    borrowerPhone = borrowerPhone ?? p.phone;
  }
  if (!borrowerName) return { ok: false, error: "Choose a person or type the borrower's name." };
  try {
    const row = await db.$transaction(async (tx) => {
      const open = await tx.assetCheckout.findFirst({ where: { assetId: asset.id, churchId: ctx.churchId, returnedAt: null }, select: { borrowerName: true } });
      if (open) throw new Error(`It is already out with ${open.borrowerName}. Mark it returned first.`);
      const claim = await tx.asset.updateMany({ where: { id: asset.id, churchId: ctx.churchId, status: { notIn: ["checked-out", "disposed"] } }, data: { status: "checked-out" } });
      if (claim.count === 0) throw new Error("It is already out with someone. Mark it returned first.");
      return tx.assetCheckout.create({
        data: {
          churchId: ctx.churchId, assetId: asset.id, personId, borrowerName, borrowerPhone,
          purpose: input.purpose?.trim() || null, dueAt: validDate(input.dueAt),
          conditionOut: input.conditionOut && CONDITION_KEYS.includes(input.conditionOut) ? input.conditionOut : asset.condition,
          note: input.note?.trim() || null, outById: ctx.userId,
        },
        select: { id: true },
      });
    });
    await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "update", entity: "asset", entityId: asset.id, detail: `Lent "${asset.name}" to ${borrowerName}` });
    safeRevalidate("/app/assets", `/app/assets/${asset.id}`);
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function checkIn(ctx: Ctx, assetId: string, conditionIn?: string | null, note?: string | null): Promise<Result> {
  const asset = await db.asset.findFirst({ where: { id: assetId, churchId: ctx.churchId }, select: { id: true, name: true } });
  if (!asset) return { ok: false, error: "That item was not found." };
  const open = await db.assetCheckout.findFirst({ where: { assetId, churchId: ctx.churchId, returnedAt: null }, orderBy: { outAt: "desc" } });
  if (!open) return { ok: false, error: "This item is not out with anyone." };
  const cond = conditionIn && CONDITION_KEYS.includes(conditionIn) ? conditionIn : null;
  await db.$transaction([
    db.assetCheckout.updateMany({ where: { id: open.id, churchId: ctx.churchId, returnedAt: null }, data: { returnedAt: new Date(), conditionIn: cond, inById: ctx.userId, ...(note?.trim() ? { note: [open.note, note.trim()].filter(Boolean).join(" / ") } : {}) } }),
    db.asset.updateMany({ where: { id: assetId, churchId: ctx.churchId }, data: { status: "in-service", ...(cond ? { condition: cond } : {}) } }),
  ]);
  await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "update", entity: "asset", entityId: assetId, detail: `"${asset.name}" returned by ${open.borrowerName}` });
  safeRevalidate("/app/assets", `/app/assets/${assetId}`);
  return { ok: true, id: open.id };
}

export type DisposeInput = { assetId: string; method: string; date?: Date | null; amount?: number | null; accountId?: string | null; note?: string | null };

/** Dispose of an item. Money received for it is posted once as income to the chosen account. */
export async function dispose(ctx: Ctx, input: DisposeInput): Promise<Result> {
  if (!DISPOSAL_KEYS.includes(input.method)) return { ok: false, error: "Choose how it left the church." };
  const asset = await db.asset.findFirst({ where: { id: input.assetId, churchId: ctx.churchId }, select: { id: true, name: true, status: true } });
  if (!asset) return { ok: false, error: "That item was not found." };
  if (asset.status === "disposed") return { ok: false, error: "This item is already disposed of." };
  const amount = input.amount && input.amount > 0 ? round2(input.amount) : 0;
  let accountId: string | null = null;
  if (amount > 0 && input.accountId && input.accountId !== "none") {
    accountId = await ownedId("churchAccount", input.accountId, ctx.churchId);
    if (!accountId) return { ok: false, error: "That account was not found." };
  }
  const when = validDate(input.date) ?? new Date();
  const resolvedAccount = amount > 0 && input.accountId !== "none" ? await resolveAccountId(ctx.churchId, accountId) : null;

  const result = await db.$transaction(async (tx) => {
    const claim = await tx.asset.updateMany({
      where: { id: asset.id, churchId: ctx.churchId, status: { not: "disposed" } },
      data: { status: "disposed", disposedAt: when, disposalMethod: input.method, disposalAmount: amount || null, disposalNote: input.note?.trim() || null },
    });
    if (claim.count === 0) return null;
    // Anything still lent out comes back on paper.
    await tx.assetCheckout.updateMany({ where: { assetId: asset.id, churchId: ctx.churchId, returnedAt: null }, data: { returnedAt: when, inById: ctx.userId } });
    if (amount > 0) {
      const txn = await tx.transaction.create({
        data: {
          churchId: ctx.churchId,
          accountId: resolvedAccount,
          pendingDeposit: input.accountId === "none",
          description: `Sale of ${asset.name}`,
          category: "Asset sales",
          amount,
          date: when,
        },
        select: { id: true },
      });
      await tx.asset.update({ where: { id: asset.id }, data: { disposalTxnId: txn.id } });
    }
    return true;
  });
  if (!result) return { ok: false, error: "This item is already disposed of." };
  await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "update", entity: "asset", entityId: asset.id, detail: `Disposed of "${asset.name}" (${input.method}${amount ? `, GHS ${amount}` : ""})` });
  safeRevalidate("/app/assets", `/app/assets/${asset.id}`, "/app/accounting");
  return { ok: true, id: asset.id };
}

/** Give every untagged item in the list a tag (used before printing labels). */
export async function assignMissingTags(churchId: string, ids?: string[]): Promise<number> {
  const missing = await db.asset.findMany({ where: { churchId, tagCode: null, ...(ids?.length ? { id: { in: ids } } : {}) }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 2000 });
  for (const a of missing) {
    const tag = await nextTag(churchId);
    await db.asset.updateMany({ where: { id: a.id, churchId, tagCode: null }, data: { tagCode: tag } });
  }
  return missing.length;
}
