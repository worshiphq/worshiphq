"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { LIVE_CHURCH } from "@/lib/live-church";
import { sendOutreach } from "@/lib/outreach/send";
import { CREDITS_TEMPLATE } from "@/lib/sms/credit-alerts";

/** Email one church, by hand, that its SMS credits have run out. */
export async function sendCreditAlert(churchId: string): Promise<{ ok: true; stubbed: boolean } | { ok: false; error: string }> {
  await requireSuperAdmin();
  await logAdminAction("sendCreditAlert", { churchId });
  const church = await db.church.findFirst({
    where: { id: churchId, ...LIVE_CHURCH },
    select: { users: { where: { role: { in: ["Owner", "Admin"] } }, orderBy: { createdAt: "asc" }, select: { id: true, email: true, role: true } } },
  });
  if (!church) return { ok: false, error: "Church not found." };
  const to = church.users.find((u) => u.role === "Owner" && u.email) ?? church.users.find((u) => u.email);
  if (!to) return { ok: false, error: "This church's owner and admins have no email address." };
  // A double press, or two tabs, sends one email.
  const justSent = await db.outreachMessage.findFirst({
    where: { churchId, channel: "email", template: CREDITS_TEMPLATE, status: "sent", createdAt: { gte: new Date(Date.now() - 5 * 60_000) } },
    select: { id: true },
  });
  if (justSent) return { ok: false, error: "They were emailed less than 5 minutes ago." };
  const r = await sendOutreach({ churchId, userId: to.id, channel: "email", template: CREDITS_TEMPLATE });
  revalidatePath("/admin/sms");
  return r.ok ? { ok: true, stubbed: r.status === "stubbed" } : { ok: false, error: r.error ?? "The email did not go." };
}
