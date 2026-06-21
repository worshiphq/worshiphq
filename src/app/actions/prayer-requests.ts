"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";

export async function createPrayerRequest(formData: FormData) {
  const session = await requireModule("people");
  if (session.isDemo) return;

  const name = String(formData.get("name") ?? "").trim();
  const request = String(formData.get("request") ?? "").trim();
  const isAnonymous = formData.get("isAnonymous") === "on";
  if (!name || !request) return;

  await db.prayerRequest.create({
    data: {
      churchId: session.churchId,
      name: isAnonymous ? "Anonymous" : name,
      request,
      isAnonymous,
    },
  });

  revalidatePath("/app/prayer-requests");
}

export async function updatePrayerRequestStatus(formData: FormData) {
  const session = await requireModule("people");
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["active", "answered", "archived"].includes(status)) return;

  await db.prayerRequest.updateMany({
    where: { id, churchId: session.churchId },
    data: {
      status,
      ...(status === "answered" ? {} : {}),
    },
  });

  revalidatePath("/app/prayer-requests");
}

export async function incrementPrayerCount(formData: FormData) {
  const session = await requireModule("people");
  const id = String(formData.get("id"));

  await db.prayerRequest.updateMany({
    where: { id, churchId: session.churchId },
    data: { prayerCount: { increment: 1 } },
  });

  revalidatePath("/app/prayer-requests");
}

export async function deletePrayerRequest(formData: FormData) {
  const session = await requireModule("people");
  const id = String(formData.get("id"));

  await db.prayerRequest.deleteMany({
    where: { id, churchId: session.churchId },
  });

  revalidatePath("/app/prayer-requests");
}
