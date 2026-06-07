"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import type { GiftMethod } from "@prisma/client";

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
