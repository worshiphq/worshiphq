"use server";

import { revalidatePath } from "next/cache";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { bool, errorText } from "@/lib/form-read";

/** Who gets the daily vehicles and equipment alert, by SMS too or not, and how many days before. Main Admin and Admins only. */
export async function saveAssetAlerts(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireSession();
    assertCanWrite(session);
    if (session.role !== "Owner" && session.role !== "Admin") return { ok: false, error: "Only the Main Admin or an Admin can change this." };
    const wanted = fd.getAll("userIds").map(String).filter(Boolean).slice(0, 30);
    const users = wanted.length ? await db.user.findMany({ where: { churchId: session.churchId, id: { in: wanted } }, select: { id: true } }) : [];
    const days = fd.getAll("days").map((d) => parseInt(String(d), 10)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 90);
    const value = { on: bool(fd, "on"), userIds: users.map((u) => u.id), sms: bool(fd, "sms"), days: days.length ? [...new Set(days)] : [30, 14, 7, 1, 0] };
    await db.church.update({ where: { id: session.churchId }, data: { assetAlerts: value } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "update", entity: "settings", detail: `Vehicles and equipment alerts ${value.on ? "on" : "off"}${value.sms ? ", with SMS" : ""}` });
    revalidatePath("/app/reminders");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}
