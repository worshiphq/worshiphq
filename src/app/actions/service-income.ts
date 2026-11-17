"use server";

// Service income is a VIEW of Giving: money is only ever recorded in Giving (the same forms, with "Which service?").
// Nothing here creates gifts. These actions edit a service's headcount and notes, link giving that was recorded
// without a service, take a gift out of a service, and remove a service record (its money stays in Giving).

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, assertCanDelete, PlanLockedError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ownedId } from "@/lib/tenant";
import { zonedToUtc } from "@/lib/time/tz";
import { serviceIncomeAccess } from "@/lib/levies/guards";
import { churchTzFor, getServiceMonth, getServiceSheet, queryServiceSheets } from "@/lib/data/service-income";
import { findOrCreateServiceIncome, readServicePick } from "@/lib/service-income/link";
import { shiftYmd } from "@/lib/service-income/types";
import type { ServicePick } from "@/lib/service-income/choose";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Something went wrong. Please try again." });
const money = (n: number) => `GH₵${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function revalidateMoney() {
  revalidatePath("/app/service-income");
  revalidatePath("/app/giving");
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

/** Headcount, who counted and a note on a service record. Its money is changed in Giving, not here. */
export async function saveServiceHeader(input: { id: string; headcount?: number | null; countedBy?: string | null; note?: string | null }): Promise<Result> {
  try {
    const s = await requireSession();
    assertCanWrite(s, "service-income");
    const id = await ownedId("serviceIncome", input?.id, s.churchId);
    if (!id) return { ok: false, error: "That service record could not be found." };
    const n = Number(input.headcount);
    const headcount = Number.isFinite(n) && n > 0 ? Math.min(100_000, Math.round(n)) : null;
    const row = await db.serviceIncome.update({
      where: { id },
      data: {
        headcount,
        countedBy: String(input.countedBy ?? "").trim().slice(0, 120) || null,
        note: String(input.note ?? "").trim().slice(0, 300) || null,
      },
      select: { serviceName: true },
    });
    await audit(s, "update", "serviceIncome", `Updated the headcount and notes for ${row.serviceName}${headcount ? ` (${headcount} people)` : ""}`, id);
    revalidatePath("/app/service-income");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * Link giving recorded on one day without a service to a service on that day (the record is found or made).
 * Only this church's gifts, only that local day, only ones not linked yet: nothing is created or entered twice.
 */
export async function linkGiftsToService(input: { dateYmd: string; giftIds: string[]; service: ServicePick }): Promise<Result<{ count: number; total: number; message: string }>> {
  try {
    const s = await requireSession();
    assertCanWrite(s, "service-income");
    if (!YMD.test(String(input?.dateYmd ?? ""))) return { ok: false, error: "Choose the day." };
    const pick = readServicePick(input.service);
    if (!pick) return { ok: false, error: "Choose which service this giving came in at." };
    const ids = [...new Set((input.giftIds ?? []).filter((x) => typeof x === "string"))].slice(0, 500);
    if (!ids.length) return { ok: false, error: "There is nothing to link on that day." };

    const tz = await churchTzFor(s.churchId);
    const where = {
      id: { in: ids }, churchId: s.churchId, serviceIncomeId: null,
      date: { gte: zonedToUtc(input.dateYmd, "00:00", tz), lt: zonedToUtc(shiftYmd(input.dateYmd, 1), "00:00", tz) },
    };
    const agg = await db.gift.aggregate({ where, _sum: { amount: true } });
    const serviceId = await findOrCreateServiceIncome(s.churchId, input.dateYmd, pick, { userId: s.userId, name: s.name });
    if (!serviceId) return { ok: false, error: "Choose which service this giving came in at." };
    const r = await db.gift.updateMany({ where, data: { serviceIncomeId: serviceId } });
    if (!r.count) return { ok: false, error: "That giving is already linked to a service. Refresh the page." };
    const total = Number(agg._sum.amount ?? 0);
    await audit(s, "update", "serviceIncome", `Linked ${r.count} gift${r.count === 1 ? "" : "s"} (GHS ${total.toFixed(2)}) on ${input.dateYmd} to ${pick.name}`, serviceId);
    revalidateMoney();
    return { ok: true, count: r.count, total, message: `${money(total)} linked to ${pick.name}.` };
  } catch (e) { return fail(e); }
}

/** Take a gift out of a service. The gift stays in Giving, as "Not linked to a service". */
export async function untagGiftFromService(giftId: string): Promise<Result> {
  try {
    const s = await requireSession();
    assertCanWrite(s, "service-income");
    const r = await db.gift.updateMany({ where: { id: giftId, churchId: s.churchId, serviceIncomeId: { not: null } }, data: { serviceIncomeId: null } });
    if (!r.count) return { ok: false, error: "That gift is not linked to a service." };
    await audit(s, "update", "serviceIncome", "Took a gift out of a service. It stays in Giving.", giftId);
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
