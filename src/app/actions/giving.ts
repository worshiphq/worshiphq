"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, assertCanDelete } from "@/lib/auth";
import { sendChurchSms } from "@/lib/sms/credits";
import { logAudit } from "@/lib/audit";
import { RecycleBin } from "@/lib/recycle-bin";
import type { GiftMethod } from "@prisma/client";
import type { ServicePick } from "@/lib/service-income/choose";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The service record (Service income) giving recorded on this date belongs to, made if needed. Null when the
 * person chose "Not linked to a service". Linking is plain data, so it works on every plan that has Giving.
 */
async function serviceLinkFor(session: { churchId: string; userId: string; name?: string | null }, rawDate: unknown, rawPick: unknown): Promise<string | null> {
  const { readServicePick, findOrCreateServiceIncome } = await import("@/lib/service-income/link");
  const pick = readServicePick(rawPick);
  if (!pick) return null;
  let ymd = String(rawDate ?? "").trim();
  if (!YMD.test(ymd)) {
    const [{ churchTzFor }, { ymdInTz }] = await Promise.all([import("@/lib/data/service-income"), import("@/lib/time/tz")]);
    ymd = ymdInTz(new Date(), await churchTzFor(session.churchId));
  }
  return findOrCreateServiceIncome(session.churchId, ymd, pick, { userId: session.userId, name: session.name ?? null });
}

function revalidateServiceIncome() {
  revalidatePath("/app/service-income");
  revalidatePath("/app/levies");
}

/** The services giving on this date can be linked to (the "Which service?" choice on the Giving forms). */
export async function loadServiceChoices(ymd: string) {
  const session = await requireSession();
  const { hasSection } = await import("@/lib/permissions");
  if (!hasSection(session, "giving") && !hasSection(session, "service-income")) return [];
  if (!YMD.test(String(ymd ?? ""))) return [];
  const { serviceChoicesOn } = await import("@/lib/service-income/link");
  return serviceChoicesOn(session.churchId, ymd);
}

/** What is already recorded for this fund on this date, so the collection form can warn before it is entered twice. */
export async function collectionAlreadyRecorded(fund: string, ymd: string): Promise<{ total: number; count: number }> {
  const session = await requireSession();
  const { hasSection } = await import("@/lib/permissions");
  const name = String(fund ?? "").trim();
  if (!hasSection(session, "giving") || !name || !YMD.test(String(ymd ?? ""))) return { total: 0, count: 0 };
  const [{ churchTzFor }, { zonedToUtc }, { shiftYmd }] = await Promise.all([import("@/lib/data/service-income"), import("@/lib/time/tz"), import("@/lib/service-income/types")]);
  const tz = await churchTzFor(session.churchId);
  const agg = await db.gift.aggregate({
    where: { churchId: session.churchId, fund: { name: { equals: name, mode: "insensitive" } }, date: { gte: zonedToUtc(ymd, "00:00", tz), lt: zonedToUtc(shiftYmd(ymd, 1), "00:00", tz) } },
    _sum: { amount: true }, _count: { _all: true },
  });
  return { total: Number(agg._sum.amount ?? 0), count: agg._count._all };
}

export async function deleteGift(id: string) {
  const session = await requireSession();
  assertCanDelete(session);
  const gift = await db.gift.findFirst({ where: { id, churchId: session.churchId }, select: { donorName: true, amount: true } });
  await RecycleBin.captureGift(session, id);
  await db.gift.deleteMany({ where: { id, churchId: session.churchId } });
  if (gift) await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "gift", entityId: id, detail: `Deleted GHS ${gift.amount} gift from ${gift.donorName}` });
  revalidatePath("/app/giving");
  revalidatePath("/app");
}

const METHOD_FROM_LABEL: Record<string, GiftMethod> = {
  "MTN MoMo": "MTN_MoMo",
  "Telecel Cash": "Telecel_Cash",
  AirtelTigo: "AirtelTigo",
  Card: "Card",
  Cash: "Cash",
  Bank: "Bank",
  "Bank transfer": "Bank",
};

/** A date from a form (YYYY-MM-DD) as midday, so timezones never shift the day; today if blank/invalid. */
function formDate(v: FormDataEntryValue | string | null | undefined): Date {
  const raw = String(v ?? "").trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d : new Date();
}

export async function recordGift(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session, "giving");

  const donorName = String(formData.get("donor") ?? "").trim() || "Anonymous";
  const amount = Number(formData.get("amount") ?? 0);
  const fundName = String(formData.get("fund") ?? "").trim();
  const method = METHOD_FROM_LABEL[String(formData.get("method") ?? "Cash")] ?? "Cash";
  if (!amount || amount <= 0) return;

  // Resolve fund (create on the fly if it doesn't exist yet for this church).
  let fundId: string | undefined;
  if (fundName) {
    const fund =
      (await db.fund.findFirst({ where: { churchId: session.churchId, name: fundName } })) ??
      (await db.fund.create({ data: { churchId: session.churchId, name: fundName } }));
    fundId = fund.id;
  }

  // Try to match an existing member by full name. A single name ("Kofi") is not enough to know which member it is,
  // so it is left unmatched rather than attached to the first Kofi on the list.
  const [first, ...rest] = donorName.split(/\s+/);
  const person = rest.length
    ? await db.person.findFirst({ where: { churchId: session.churchId, firstName: first, lastName: rest.join(" ") }, select: { id: true } })
    : null;

  // Bank the gift into the chosen account (or the church default), or leave it "not banked yet" (cash still in hand).
  const chosenAccount = String(formData.get("accountId") ?? "").trim() || null;
  const notBanked = chosenAccount === "none";
  const { resolveAccountId } = await import("@/lib/data/accounts");
  const accountId = notBanked ? null : await resolveAccountId(session.churchId, chosenAccount);
  const serviceIncomeId = await serviceLinkFor(session, formData.get("date"), {
    name: formData.get("serviceName"), slotId: formData.get("serviceSlotId"), sessionId: formData.get("serviceSessionId"),
  });

  const gift = await db.gift.create({
    data: {
      churchId: session.churchId,
      branchId: session.branchId ?? undefined,
      personId: person?.id,
      donorName,
      fundId,
      amount,
      method,
      currency: "GHS",
      date: formDate(formData.get("date")),
      ...(accountId ? { accountId } : {}),
      pendingDeposit: notBanked,
      serviceIncomeId,
    },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "gift", entityId: gift.id, detail: `Recorded GHS ${amount} from ${donorName}` });
  revalidatePath("/app/giving");
  if (serviceIncomeId) revalidateServiceIncome();
  revalidatePath("/app");
}

/**
 * Record a collection (offertory and similar) as ONE counted total, split by how
 * it was received: cash, Mobile Money, bank/card. Nobody is named: the church
 * counts it together and banks it together. Each part becomes one gift, banked
 * into its own account, so account balances and accounting stay right.
 */
export interface CollectionLine { method: string; amount: number; accountId?: string | null; /** received but not banked yet */ notBanked?: boolean }

export async function recordCollection(input: { fund: string; date: string; note?: string; lines: CollectionLine[]; serviceIncomeId?: string | null; service?: ServicePick | null }) {
  const session = await requireSession();
  assertCanWrite(session, "giving");
  if (session.isDemo) return { ok: false as const, error: "This is the read-only demo." };

  const fundName = (input.fund ?? "").trim();
  if (!fundName) return { ok: false as const, error: "Choose which fund this is for." };
  const { cleanCollectionLines, createCollectionGifts } = await import("@/lib/giving/collection");
  const lines = cleanCollectionLines(input.lines);
  if (lines.length === 0) return { ok: false as const, error: "Enter how much was collected." };

  // An optional service record (Service income) this collection belongs to. Only one of this church's.
  const { ownedId } = await import("@/lib/tenant");
  // Or the service chosen by name ("Which service?"), whose record is found or made for that date.
  let serviceIncomeId = input.serviceIncomeId ? await ownedId("serviceIncome", input.serviceIncomeId, session.churchId) : null;
  if (input.serviceIncomeId && !serviceIncomeId) return { ok: false as const, error: "That service record could not be found." };
  if (!serviceIncomeId && input.service) serviceIncomeId = await serviceLinkFor(session, input.date, input.service);

  const fund =
    (await db.fund.findFirst({ where: { churchId: session.churchId, name: { equals: fundName, mode: "insensitive" } } })) ??
    (await db.fund.create({ data: { churchId: session.churchId, name: fundName } }));

  const { resolveAccountId } = await import("@/lib/data/accounts");
  const { total } = await createCollectionGifts(db, session.churchId, {
    fundId: fund.id, fundName: fund.name, date: formDate(input.date), note: input.note, branchId: session.branchId, serviceIncomeId, lines,
    resolveAccount: (chosen) => resolveAccountId(session.churchId, chosen),
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "gift", detail: `Recorded ${fund.name} collection of GHS ${total} (${lines.length} part${lines.length === 1 ? "" : "s"})` });
  revalidatePath("/app/giving");
  revalidatePath("/app/accounting");
  if (serviceIncomeId) revalidateServiceIncome();
  revalidatePath("/app");
  return { ok: true as const, total };
}

export async function saveTitheTemplate(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session, "giving");
  const template = String(formData.get("template") ?? "").trim();
  if (!template) return { ok: false, error: "Template cannot be empty." };
  await db.church.update({
    where: { id: session.churchId },
    data: { titheReceiptTemplate: template },
  });
  revalidatePath("/app/giving");
  return { ok: true };
}

/** The date and service a whole batch was received at (both optional: today, not linked). */
export interface BatchOptions { date?: string | null; service?: ServicePick | null }

export interface TitheEntry {
  personId: string;
  amount: number;
  method: string;
  /** Optional account the whole batch is banked into (else the default). */
  accountId?: string | null;
}

export async function recordGivingBatch(fundName: string, entries: TitheEntry[], opts: BatchOptions = {}) {
  const session = await requireSession();
  assertCanWrite(session, "giving");
  // Amounts come from the browser: keep only real, positive ones (a negative or blank amount must never be saved).
  entries = entries.filter((e) => Number.isFinite(e.amount) && e.amount > 0);
  if (!entries.length) return { ok: false, error: "No entries to record." };
  if (!fundName.trim()) return { ok: false, error: "Fund name required." };

  const fund =
    (await db.fund.findFirst({ where: { churchId: session.churchId, name: { equals: fundName, mode: "insensitive" } } })) ??
    (await db.fund.create({ data: { churchId: session.churchId, name: fundName } }));

  const people = await db.person.findMany({
    where: { id: { in: entries.map((e) => e.personId) }, churchId: session.churchId },
    select: { id: true, firstName: true, lastName: true, phone: true },
  });
  const personMap = new Map(people.map((p) => [p.id, p]));

  const { resolveAccountId } = await import("@/lib/data/accounts");
  const batchNotBanked = entries[0]?.accountId === "none";
  const batchAccountId = batchNotBanked ? null : await resolveAccountId(session.churchId, entries[0]?.accountId ?? null);
  const batchDate = opts.date && YMD.test(opts.date) ? formDate(opts.date) : new Date();
  const serviceIncomeId = await serviceLinkFor(session, opts.date, opts.service);

  let recorded = 0;
  for (const entry of entries) {
    const person = personMap.get(entry.personId);
    if (!person) continue;
    const method = METHOD_FROM_LABEL[entry.method] ?? "Cash";
    await db.gift.create({
      data: {
        churchId: session.churchId,
        branchId: session.branchId ?? undefined,
        personId: person.id,
        donorName: `${person.firstName} ${person.lastName}`,
        fundId: fund.id,
        ...(batchAccountId ? { accountId: batchAccountId } : {}),
        pendingDeposit: batchNotBanked,
        amount: entry.amount,
        method,
        currency: "GHS",
        date: batchDate,
        serviceIncomeId,
      },
    });
    recorded++;
  }

  revalidatePath("/app/giving");
  if (serviceIncomeId) revalidateServiceIncome();
  revalidatePath("/app");
  return { ok: true, recorded };
}

export async function recordTitheBatch(entries: TitheEntry[], opts: BatchOptions = {}) {
  const session = await requireSession();
  assertCanWrite(session, "giving");
  // Amounts come from the browser: keep only real, positive ones (a negative or blank amount must never be saved).
  entries = entries.filter((e) => Number.isFinite(e.amount) && e.amount > 0);
  if (!entries.length) return { ok: false, error: "No entries to record." };

  const titheFund =
    (await db.fund.findFirst({ where: { churchId: session.churchId, name: { equals: "Tithes", mode: "insensitive" } } })) ??
    (await db.fund.create({ data: { churchId: session.churchId, name: "Tithes" } }));

  // Bank this batch into the chosen account, or the church's default.
  const { resolveAccountId } = await import("@/lib/data/accounts");
  const batchNotBanked = entries[0]?.accountId === "none";
  const batchAccountId = batchNotBanked ? null : await resolveAccountId(session.churchId, entries[0]?.accountId ?? null);
  const batchDate = opts.date && YMD.test(opts.date) ? formDate(opts.date) : new Date();
  const serviceIncomeId = await serviceLinkFor(session, opts.date, opts.service);

  const [people, church] = await Promise.all([
    db.person.findMany({
      where: { id: { in: entries.map((e) => e.personId) }, churchId: session.churchId },
      select: { id: true, firstName: true, lastName: true, phone: true },
    }),
    db.church.findUnique({
      where: { id: session.churchId },
      select: { name: true, titheReceiptTemplate: true },
    }),
  ]);
  const personMap = new Map(people.map((p) => [p.id, p]));

  const defaultTemplate = "Dear {name}, your Tithe of GHS {amount} has been received by {church}. God Bless You for paying your Tithes to the Lord. Malachi 3:10 Shalom!";
  const template = church?.titheReceiptTemplate || defaultTemplate;

  let recorded = 0;
  let smsSent = 0;
  let insufficientCredits = false;

  for (const entry of entries) {
    const person = personMap.get(entry.personId);
    if (!person) continue;

    const method = METHOD_FROM_LABEL[entry.method] ?? "Cash";
    const donorName = `${person.firstName} ${person.lastName}`;

    const gift = await db.gift.create({
      data: {
        churchId: session.churchId,
        branchId: session.branchId ?? undefined,
        personId: person.id,
        donorName,
        fundId: titheFund.id,
        ...(batchAccountId ? { accountId: batchAccountId } : {}),
        pendingDeposit: batchNotBanked,
        amount: entry.amount,
        method,
        currency: "GHS",
        date: batchDate,
        serviceIncomeId,
      },
    });
    recorded++;

    if (person.phone && !insufficientCredits) {
      const amountStr = entry.amount.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const msg = template
        .replace(/\{name\}/gi, donorName)
        .replace(/\{amount\}/gi, amountStr)
        .replace(/\{church\}/gi, church?.name ?? "your church");
      const smsResult = await sendChurchSms(session.churchId, person.phone, msg, { note: "Tithe receipt" });
      if (smsResult.ok) {
        smsSent++;
        await db.gift.update({ where: { id: gift.id }, data: { receiptSent: true } });
      } else if (smsResult.insufficient) {
        insufficientCredits = true;
      }
    }
  }

  revalidatePath("/app/giving");
  if (serviceIncomeId) revalidateServiceIncome();
  revalidatePath("/app");

  return { ok: true, recorded, smsSent, insufficientCredits };
}
