"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";

export async function createWelfareRecord(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return;

  const recipientName = String(formData.get("recipientName") ?? "").trim();
  if (!recipientName) return;

  const type = String(formData.get("type") ?? "financial");
  const amount = parseFloat(String(formData.get("amount") ?? "0")) || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "").trim();
  const personId = String(formData.get("personId") ?? "").trim() || null;

  await db.welfareRecord.create({
    data: {
      churchId: session.churchId,
      recipientName,
      type,
      amount,
      description,
      personId,
      ...(dateStr ? { date: new Date(dateStr) } : {}),
    },
  });

  revalidatePath("/app/welfare");
}

export async function deleteWelfareRecord(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  await db.welfareRecord.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/welfare");
}
