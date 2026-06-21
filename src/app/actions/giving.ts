"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, assertCanDelete } from "@/lib/auth";
import { sendChurchSms } from "@/lib/sms/credits";
import type { GiftMethod } from "@prisma/client";

export async function deleteGift(id: string) {
  const session = await requireSession();
  assertCanDelete(session);
  await db.gift.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/giving");
  revalidatePath("/app");
}

const METHOD_FROM_LABEL: Record<string, GiftMethod> = {
  "MTN MoMo": "MTN_MoMo",
  "Telecel Cash": "Telecel_Cash",
  AirtelTigo: "AirtelTigo",
  Card: "Card",
  Cash: "Cash",
};

export async function recordGift(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

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

  // Try to match an existing member by name.
  const [first, ...rest] = donorName.split(" ");
  const person = await db.person.findFirst({
    where: { churchId: session.churchId, firstName: first, lastName: rest.join(" ") || undefined },
    select: { id: true },
  });

  await db.gift.create({
    data: {
      churchId: session.churchId,
      branchId: session.branchId ?? undefined,
      personId: person?.id,
      donorName,
      fundId,
      amount,
      method,
      currency: "GHS",
    },
  });

  revalidatePath("/app/giving");
  revalidatePath("/app");
}

export async function saveTitheTemplate(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  const template = String(formData.get("template") ?? "").trim();
  if (!template) return { ok: false, error: "Template cannot be empty." };
  await db.church.update({
    where: { id: session.churchId },
    data: { titheReceiptTemplate: template },
  });
  revalidatePath("/app/giving");
  return { ok: true };
}

export interface TitheEntry {
  personId: string;
  amount: number;
  method: string;
}

export async function recordTitheBatch(entries: TitheEntry[]) {
  const session = await requireSession();
  assertCanWrite(session);
  if (!entries.length) return { ok: false, error: "No entries to record." };

  const titheFund =
    (await db.fund.findFirst({ where: { churchId: session.churchId, name: { equals: "Tithes", mode: "insensitive" } } })) ??
    (await db.fund.create({ data: { churchId: session.churchId, name: "Tithes" } }));

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
        amount: entry.amount,
        method,
        currency: "GHS",
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
  revalidatePath("/app");

  return { ok: true, recorded, smsSent, insufficientCredits };
}
