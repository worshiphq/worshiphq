"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, assertCanDelete } from "@/lib/auth";

export async function deleteEvent(id: string) {
  const session = await requireSession();
  assertCanDelete(session);
  await db.event.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/events");
}

export async function createEvent(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "09:00");
  const startsAt = new Date(`${date}T${time || "09:00"}`);
  const paid = String(formData.get("paid") ?? "Free") === "Paid";
  const price = Number(formData.get("price") ?? 0);
  const capacity = Number(formData.get("capacity") ?? 0);

  await db.event.create({
    data: {
      churchId: session.churchId,
      branchId: session.branchId ?? undefined,
      title,
      type: String(formData.get("type") ?? "Service"),
      startsAt: isNaN(startsAt.getTime()) ? new Date() : startsAt,
      capacity: capacity || undefined,
      paid,
      price: paid && price > 0 ? price : undefined,
    },
  });

  revalidatePath("/app/events");
}
