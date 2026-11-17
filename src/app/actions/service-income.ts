"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, assertCanDelete, PlanLockedError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ownedId } from "@/lib/tenant";
import { ymdInTz, zonedToUtc } from "@/lib/time/tz";
import { serviceIncomeAccess } from "@/lib/levies/guards";
import { cleanCollectionLines, createCollectionGifts } from "@/lib/giving/collection";
import { churchTzFor, getServiceMonth, getServiceSheet, queryServiceSheets, untaggedGiftsOn } from "@/lib/data/service-income";
import { shiftYmd } from "@/lib/service-income/types";
import type { GiftMethod } from "@prisma/client";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const METHODS: GiftMethod[] = ["Cash", "MTN_MoMo", "Telecel_Cash", "AirtelTigo", "Card", "Bank"];
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Something went wrong. Please try again." });

function revalidateMoney() {
  revalidatePath("/app/service-income");
  revalidatePath("/app/giving");
  revalidatePath("/app/accounting");
  revalidatePath("/app/levies");
  revalidatePath("/app");
}

async function readSession() {
  const s = await requireSession();
  const a = serviceIncomeAccess(s);
  if (!a.see) throw new Error("Your role cannot see service income.");
  if (a.lockedFeature) throw new PlanLockedError("service-income");
  return s;
}

export interface SheetInput {
  id?: string | null;
  dateYmd: string;
  serviceName: string;
  sessionId?: string | null;
  slotId?: string | null;
  headcount?: number | null;
  countedBy?: string | null;
  note?: string | null;
  /** New counted lines: one per fund and way it was received. */
  lines: { fundId: string; method: string; amount: number; accountId?: string | null; notBanked?: boolean }[];
  /** Changes to this record's own counted gifts. */
  edits?: { giftId: string; amount: number; method: string; accountId?: string | null; notBanked?: boolean }[];
  /** This record's own gifts to remove (they go to the recycle bin). */
  removeGiftIds?: string[];
  /** Gifts already recorded in Giving that day to count in this service. */
  tagGiftIds?: string[];
}

/** Save a service record: the header, any new counted money (as ordinary gifts), changes, removals and gifts tied to it. */
export async function saveServiceSheet(input: SheetInput): Promise<Result<{ id: string; total: number; message: string }>> {
  try {
    const s = await requireSession();
    assertCanWrite(s, "service-income");
    const tz = await churchTzFor(s.churchId);
    if (!YMD.test(input.dateYmd ?? "")) return { ok: false, error: "Choose the date of the service." };
    if (input.dateYmd > ymdInTz(new Date(), tz)) return { ok: false, error: "The service date cannot be in the future." };
    const serviceName = String(input.serviceName ?? "").trim().slice(0, 80);
    if (!serviceName) return { ok: false, error: "Say which service this was, for example Sunday 1st service." };
    const removals = [...new Set(input.removeGiftIds ?? [])].slice(0, 100);
    if (removals.length) assertCanDelete(s);

    const date = zonedToUtc(input.dateYmd, "12:00", tz);
    const dayFrom = zonedToUtc(input.dateYmd, "00:00", tz);
    const dayTo = zonedToUtc(shiftYmd(input.dateYmd, 1), "00:00", tz);
    const slotId = await ownedId("serviceSlot", input.slotId, s.churchId);
    let sessionId = await ownedId("attendanceSession", input.sessionId, s.churchId);
    if (!sessionId) {
      // Link the attendance taken at the same service that day, when there is one.
      const match = await db.attendanceSession.findFirst({ where: { churchId: s.churchId, serviceName: { equals: serviceName, mode: "insensitive" }, date: { gte: dayFrom, lt: dayTo } }, select: { id: true } });
      sessionId = match?.id ?? null;
    }
    const headcount = Number.isFinite(Number(input.headcount)) && Number(input.headcount) > 0 ? Math.min(100_000, Math.round(Number(input.headcount))) : null;
    const header = {
      date, serviceName, sessionId, slotId, headcount,
      countedBy: String(input.countedBy ?? "").trim().slice(0, 120) || null,
      note: String(input.note ?? "").trim().slice(0, 300) || null,
    };

    let id: string;
    if (input.id) {
      const own = await ownedId("serviceIncome", input.id, s.churchId);
      if (!own) return { ok: false, error: "That service record could not be found." };
      id = own;
      await db.serviceIncome.update({ where: { id }, data: header });
      // Its money follows the service's date.
      await db.gift.updateMany({ where: { churchId: s.churchId, serviceIncomeId: id, reference: null }, data: { date } });
    } else {
      id = (await db.serviceIncome.create({ data: { churchId: s.churchId, ...header, createdById: s.userId, createdByName: s.name }, select: { id: true } })).id;
    }

    const { resolveAccountId } = await import("@/lib/data/accounts");
    const resolveAccount = (chosen: string | null) => resolveAccountId(s.churchId, chosen);

    // New counted money, one fund at a time, through the same code Giving uses.
    let added = 0;
    const byFund = new Map<string, SheetInput["lines"]>();
    for (const l of input.lines ?? []) byFund.set(l.fundId, [...(byFund.get(l.fundId) ?? []), l]);
    if (byFund.size) {
      const funds = await db.fund.findMany({ where: { churchId: s.churchId, id: { in: [...byFund.keys()] } }, select: { id: true, name: true } });
      for (const f of funds) {
        const lines = cleanCollectionLines(byFund.get(f.id));
        if (!lines.length) continue;
        const r = await createCollectionGifts(db, s.churchId, { fundId: f.id, fundName: f.name, date, note: serviceName, branchId: s.branchId, serviceIncomeId: id, lines, resolveAccount });
        added += r.total;
      }
    }

    // Changes to this record's own counted gifts.
    for (const e of (input.edits ?? []).slice(0, 100)) {
      const amount = Math.round(Number(e.amount) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const method = METHODS.includes(e.method as GiftMethod) ? (e.method as GiftMethod) : null;
      const notBanked = !!e.notBanked || e.accountId === "none";
      const accountId = notBanked ? null : await resolveAccount(e.accountId ?? null);
      await db.gift.updateMany({
        where: { id: e.giftId, churchId: s.churchId, serviceIncomeId: id, reference: null },
        data: { amount, ...(method ? { method } : {}), accountId, pendingDeposit: notBanked },
      });
    }

    // Removals go through the recycle bin, like any deleted gift.
    if (removals.length) {
      const { RecycleBin } = await import("@/lib/recycle-bin");
      const mine = await db.gift.findMany({ where: { id: { in: removals }, churchId: s.churchId, serviceIncomeId: id }, select: { id: true } });
      for (const g of mine) {
        await RecycleBin.captureGift(s, g.id);
        await db.gift.deleteMany({ where: { id: g.id, churchId: s.churchId } });
      }
    }

    // Gifts already in Giving that day, counted in this service. Only this church's, only that local day, only untied ones.
    const tags = [...new Set(input.tagGiftIds ?? [])].slice(0, 300);
    if (tags.length) {
      await db.gift.updateMany({ where: { id: { in: tags }, churchId: s.churchId, serviceIncomeId: null, date: { gte: dayFrom, lt: dayTo } }, data: { serviceIncomeId: id } });
    }

    const total = Number((await db.gift.aggregate({ where: { churchId: s.churchId, serviceIncomeId: id }, _sum: { amount: true } }))._sum.amount ?? 0);
    await audit(s, input.id ? "update" : "create", "serviceIncome", `${input.id ? "Updated" : "Recorded"} ${serviceName} on ${input.dateYmd}: GHS ${total.toFixed(2)}${added ? ` (GHS ${added.toFixed(2)} newly counted)` : ""}`, id);
    revalidateMoney();
    return { ok: true, id, total, message: `${serviceName} saved. Total GH₵${total.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.` };
  } catch (e) { return fail(e); }
}

/** Take a gift out of a service. The gift stays in Giving. */
export async function untagGiftFromService(giftId: string): Promise<Result> {
  try {
    const s = await requireSession();
    assertCanWrite(s, "service-income");
    const r = await db.gift.updateMany({ where: { id: giftId, churchId: s.churchId, serviceIncomeId: { not: null } }, data: { serviceIncomeId: null } });
    if (!r.count) return { ok: false, error: "That gift is not tied to a service." };
    await audit(s, "update", "serviceIncome", "Took a gift out of a service record", giftId);
    revalidateMoney();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Remove a service record. The money stays in Giving; only the record is removed (and can be restored from the bin). */
export async function deleteServiceSheet(id: string): Promise<Result> {
  try {
    const s = await requireSession();
    assertCanWrite(s, "service-income");
    assertCanDelete(s);
    const row = await db.serviceIncome.findFirst({ where: { id, churchId: s.churchId }, select: { id: true, serviceName: true, date: true } });
    if (!row) return { ok: false, error: "That service record could not be found." };
    const { moveToBin } = await import("@/lib/recycle-bin");
    await moveToBin(s, "serviceIncome", "ServiceIncome", row.id, { label: row.serviceName });
    await db.serviceIncome.deleteMany({ where: { id: row.id, churchId: s.churchId } });
    await audit(s, "delete", "serviceIncome", `Removed the service record ${row.serviceName}. Its money stays in Giving.`, row.id);
    revalidateMoney();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Which kinds of income appear as rows on the service sheet. */
export async function setServiceSheetFunds(fundIds: string[]): Promise<Result> {
  try {
    const s = await requireSession();
    assertCanWrite(s, "service-income");
    const ids = [...new Set((fundIds ?? []).filter((x) => typeof x === "string"))].slice(0, 40);
    await db.$transaction([
      db.fund.updateMany({ where: { churchId: s.churchId, id: { in: ids } }, data: { inServiceSheet: true } }),
      db.fund.updateMany({ where: { churchId: s.churchId, id: { notIn: ids } }, data: { inServiceSheet: false } }),
    ]);
    await audit(s, "update", "settings", `Service sheet shows ${ids.length} kind${ids.length === 1 ? "" : "s"} of income`);
    revalidatePath("/app/service-income");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Add a new kind of income (a fund) for the sheet, e.g. Thanksgiving. */
export async function addSheetFund(name: string): Promise<Result<{ id: string; name: string }>> {
  try {
    const s = await requireSession();
    assertCanWrite(s, "service-income");
    const n = String(name ?? "").trim().slice(0, 60);
    if (!n) return { ok: false, error: "Type the name, for example Thanksgiving." };
    const existing = await db.fund.findFirst({ where: { churchId: s.churchId, name: { equals: n, mode: "insensitive" } }, select: { id: true, name: true } });
    const f = existing
      ? await db.fund.update({ where: { id: existing.id }, data: { inServiceSheet: true }, select: { id: true, name: true } })
      : await db.fund.create({ data: { churchId: s.churchId, name: n, inServiceSheet: true }, select: { id: true, name: true } });
    revalidatePath("/app/service-income");
    return { ok: true, ...f };
  } catch (e) { return fail(e); }
}

export async function getUntaggedGifts(ymd: string) {
  const s = await readSession();
  if (!YMD.test(ymd)) return [];
  return untaggedGiftsOn(s.churchId, ymd);
}

export async function loadServiceSheet(id: string) {
  const s = await readSession();
  return getServiceSheet(s.churchId, id);
}

export async function loadServiceMonth(year: number, month: number) {
  const s = await readSession();
  const y = Number(year), m = Number(month);
  if (!(y > 1990 && y < 2200 && m >= 0 && m <= 11)) throw new Error("Choose a month.");
  return getServiceMonth(s.churchId, y, m);
}

export async function searchServiceSheets(search: string, filters: { year?: number }, page: number) {
  const s = await readSession();
  return queryServiceSheets(s.churchId, String(search ?? ""), { year: Number(filters?.year) || undefined }, page);
}
