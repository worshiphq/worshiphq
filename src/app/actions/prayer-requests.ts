"use server";

import { revalidatePath } from "next/cache";
import { requireModule, requireManage } from "@/lib/auth";
import { db } from "@/lib/db";
import { RecycleBin } from "@/lib/recycle-bin";

export async function createPrayerRequest(formData: FormData) {
  const session = await requireManage("prayer-requests");
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

/** Move a request between New, Prayed for and Archived. */
export async function updatePrayerRequestStatus(formData: FormData) {
  const session = await requireManage("prayer-requests");
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["active", "prayed", "archived"].includes(status)) return;

  await db.prayerRequest.updateMany({
    where: { id, churchId: session.churchId },
    data: status === "prayed"
      ? { status, prayedAt: new Date(), prayedBy: session.name || null }
      : status === "active"
        ? { status, prayedAt: null, prayedBy: null }
        : { status },
  });

  revalidatePath("/app/prayer-requests");
}

/** Mark several requests as prayed for in one go (e.g. after a prayer meeting). */
export async function markPrayerRequestsPrayed(ids: string[]) {
  const session = await requireManage("prayer-requests");
  if (session.isDemo || ids.length === 0) return { ok: false as const, count: 0 };
  const res = await db.prayerRequest.updateMany({
    where: { id: { in: ids.slice(0, 500) }, churchId: session.churchId, status: "active" },
    data: { status: "prayed", prayedAt: new Date(), prayedBy: session.name || null },
  });
  revalidatePath("/app/prayer-requests");
  return { ok: true as const, count: res.count };
}

export async function deletePrayerRequest(formData: FormData) {
  const session = await requireManage("prayer-requests");
  const id = String(formData.get("id"));

  await RecycleBin.capturePrayerRequest(session, id);
  await db.prayerRequest.deleteMany({
    where: { id, churchId: session.churchId },
  });

  revalidatePath("/app/prayer-requests");
}
