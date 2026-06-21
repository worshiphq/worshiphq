"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, assertCanDelete } from "@/lib/auth";
import { sendChurchSms } from "@/lib/sms/credits";
import type { GiftMethod } from "@prisma/client";

const METHOD_FROM_LABEL: Record<string, GiftMethod> = {
  "MTN MoMo": "MTN_MoMo",
  "Telecel Cash": "Telecel_Cash",
  AirtelTigo: "AirtelTigo",
  Card: "Card",
  Cash: "Cash",
};

export async function setHarvestDate(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const year = Number(formData.get("year"));
  const title = String(formData.get("title") ?? "Annual Harvest").trim() || "Annual Harvest";
  const dateStr = String(formData.get("date") ?? "").trim();
  const goalStr = String(formData.get("goal") ?? "").trim();
  const date = dateStr ? new Date(dateStr) : null;
  const goal = goalStr ? Number(goalStr) : null;

  if (!year || year < 2020 || year > 2100) return { ok: false, error: "Invalid year." };

  await db.harvest.upsert({
    where: { churchId_year: { churchId: session.churchId, year } },
    create: { churchId: session.churchId, year, title, date, goal: goal ?? undefined },
    update: { title, date, goal },
  });

  revalidatePath("/app/harvest");
  return { ok: true };
}

export interface HarvestEntry {
  personId: string | null;
  donorName: string;
  donorPhone: string;
  donorType: string;
  amount: number;
  method: string;
}

export async function recordHarvestContributions(year: number, entries: HarvestEntry[]) {
  const session = await requireSession();
  assertCanWrite(session);
  if (!entries.length) return { ok: false, error: "No entries." };

  const harvest = await db.harvest.findUnique({
    where: { churchId_year: { churchId: session.churchId, year } },
  });
  if (!harvest) return { ok: false, error: "No harvest set for this year. Set a harvest date first." };

  let recorded = 0;
  let smsSent = 0;
  let insufficientCredits = false;
  let raised = Number(harvest.raised);

  for (const entry of entries) {
    const method = METHOD_FROM_LABEL[entry.method] ?? "Cash";

    await db.harvestContribution.create({
      data: {
        harvestId: harvest.id,
        churchId: session.churchId,
        personId: entry.personId || null,
        donorName: entry.donorName,
        donorPhone: entry.donorPhone || null,
        donorType: entry.donorType,
        amount: entry.amount,
        method,
      },
    });
    recorded++;
    raised += entry.amount;

    if (entry.donorPhone && !insufficientCredits) {
      const amtStr = entry.amount.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const msg = `Dear ${entry.donorName}, your Harvest contribution of GHS ${amtStr} has been received. God bless you abundantly!`;
      const smsResult = await sendChurchSms(session.churchId, entry.donorPhone, msg, { note: "Harvest receipt" });
      if (smsResult.ok) smsSent++;
      else if (smsResult.insufficient) insufficientCredits = true;
    }
  }

  await db.harvest.update({
    where: { id: harvest.id },
    data: { raised },
  });

  revalidatePath("/app/harvest");
  return { ok: true, recorded, smsSent, insufficientCredits };
}

export async function createVisitorForHarvest(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!firstName || !lastName) return { ok: false, error: "Name is required." };

  const existing = await db.person.findFirst({
    where: { churchId: session.churchId, firstName, lastName },
    select: { id: true, firstName: true, lastName: true, phone: true, photoUrl: true },
  });
  if (existing) return { ok: true, person: existing };

  const nextSeq = await db.church.update({
    where: { id: session.churchId },
    data: { memberSeq: { increment: 1 } },
    select: { memberSeq: true, memberPrefix: true, name: true },
  });
  const prefix = nextSeq.memberPrefix ?? nextSeq.name.slice(0, 3).toUpperCase();
  const memberId = `${prefix}-${String(nextSeq.memberSeq).padStart(4, "0")}`;

  const person = await db.person.create({
    data: {
      churchId: session.churchId,
      memberId,
      firstName,
      lastName,
      phone: phone || null,
      status: "visitor",
    },
    select: { id: true, firstName: true, lastName: true, phone: true, photoUrl: true },
  });

  revalidatePath("/app/harvest");
  return { ok: true, person };
}

export async function deleteHarvestContribution(id: string) {
  const session = await requireSession();
  assertCanDelete(session);

  const contribution = await db.harvestContribution.findFirst({
    where: { id, churchId: session.churchId },
  });
  if (!contribution) return { ok: false, error: "Not found." };

  await db.harvestContribution.delete({ where: { id } });

  // Update the harvest raised total
  await db.harvest.update({
    where: { id: contribution.harvestId },
    data: { raised: { decrement: Number(contribution.amount) } },
  });

  revalidatePath("/app/harvest");
  return { ok: true };
}

export async function editHarvestContribution(id: string, formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const contribution = await db.harvestContribution.findFirst({
    where: { id, churchId: session.churchId },
  });
  if (!contribution) return { ok: false, error: "Not found." };

  const amount = Number(formData.get("amount"));
  const donorName = String(formData.get("donorName") ?? contribution.donorName).trim();
  if (!amount || amount <= 0) return { ok: false, error: "Invalid amount." };

  const diff = amount - Number(contribution.amount);

  await db.harvestContribution.update({
    where: { id },
    data: { amount, donorName },
  });

  // Update harvest raised total by the difference
  if (diff !== 0) {
    await db.harvest.update({
      where: { id: contribution.harvestId },
      data: { raised: { increment: diff } },
    });
  }

  revalidatePath("/app/harvest");
  return { ok: true };
}

export async function deleteHarvest(year: number) {
  const session = await requireSession();
  assertCanDelete(session);

  const harvest = await db.harvest.findUnique({
    where: { churchId_year: { churchId: session.churchId, year } },
  });
  if (!harvest) return { ok: false, error: "Not found." };

  // Delete all contributions first
  await db.harvestContribution.deleteMany({ where: { harvestId: harvest.id } });
  await db.harvest.delete({ where: { id: harvest.id } });

  revalidatePath("/app/harvest");
  return { ok: true };
}
