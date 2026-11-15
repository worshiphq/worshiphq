"use server";

import { requireSuperAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { db } from "@/lib/db";
import { resendLoggedEmail, retryFailedEmails, checkBrevoDelivery } from "@/lib/integrations/email";

type Result = { ok: true; message: string } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/i;

/** Send one email from the log again, to the same address or a corrected one. */
export async function resendEmail(id: string, to?: string, via?: "resend" | "gmail"): Promise<Result> {
  await requireSuperAdmin();
  const fixed = to?.trim();
  if (fixed && !fixed.split(",").every((a) => EMAIL_RE.test(a.trim()))) return { ok: false, error: "That email address doesn't look right." };
  const r = await resendLoggedEmail(id, fixed || undefined, via);
  await logAdminAction("Sent an email again", { id, to: fixed || undefined, via, ok: r.ok });
  return r.ok ? { ok: true, message: `Sent through ${r.provider}.` } : { ok: false, error: r.error ?? "Every sender refused it." };
}

/** Send again every failed email from the last 3 days that can go again. */
export async function resendAllFailed(): Promise<Result> {
  await requireSuperAdmin();
  const r = await retryFailedEmails({ budgetMs: 45_000, limit: 200, maxTries: 10 });
  await logAdminAction("Sent all failed emails again", r);
  if (r.waiting === 0) return { ok: true, message: "Nothing is waiting: no failed emails from the last 3 days." };
  const left = r.waiting - r.sent - r.failed;
  return {
    ok: true,
    message: `${r.sent} sent${r.failed ? `, ${r.failed} still failing` : ""}${left > 0 ? `, ${left} not tried yet (press again)` : ""}.`,
  };
}

/** Ask Brevo what happened to the most recent sent emails (delivered, opened, bounced, blocked). */
export async function checkDeliveries(ids?: string[]): Promise<Result> {
  await requireSuperAdmin();
  const pick = ids?.length
    ? ids.slice(0, 60)
    : (await db.emailLog.findMany({
        where: { status: "sent", messageId: { not: null }, OR: [{ delivery: null }, { delivery: { in: ["waiting", "deferred", "unknown"] } }], createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
        orderBy: { createdAt: "desc" },
        take: 60,
        select: { id: true },
      })).map((r) => r.id);
  if (!pick.length) return { ok: true, message: "Nothing new to check." };
  const r = await checkBrevoDelivery(pick);
  if (r.error) return { ok: false, error: r.error };
  return { ok: true, message: `Checked ${r.checked} with Brevo.` };
}
