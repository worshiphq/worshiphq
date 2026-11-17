"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdmin, hashPassword } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { INTERNAL_SLUG_PREFIX } from "@/lib/live-church";
import { rateLimit, MINUTE } from "@/lib/rate-limit";

/** The owner login of the internal QA church. A reserved .test address: no email to it is ever handed to a provider. */
const QA_OWNER_EMAIL = "qa-owner@example.test";

export type QaChurchResult =
  | { ok: true; created: boolean; churchId: string; slug: string; name: string; email: string; password?: string }
  | { ok: false; error: string };

/**
 * Make the hidden internal QA church (or return the one that already exists). It is on Max with no end date and no
 * payment, has no SMS credits, never sends real SMS or email, and is left out of every platform number, cron and
 * outreach. The owner password is shown once, to the SuperAdmin who made it, and is never stored in plain text.
 */
export async function createInternalQaChurch(): Promise<QaChurchResult> {
  const sa = await requireSuperAdmin();
  if (!(await rateLimit(`admin:qa-church:${sa.email}`, 5, 10 * MINUTE))) return { ok: false, error: "Too many tries. Wait a few minutes." };

  const existing = await db.church.findFirst({ where: { isInternal: true }, orderBy: { createdAt: "asc" }, select: { id: true, slug: true, name: true } });
  if (existing) {
    const owner = await db.user.findFirst({ where: { churchId: existing.id, role: "Owner" }, orderBy: { createdAt: "asc" }, select: { email: true } });
    return { ok: true, created: false, churchId: existing.id, slug: existing.slug, name: existing.name, email: owner?.email ?? QA_OWNER_EMAIL };
  }
  if (await db.user.findUnique({ where: { email: QA_OWNER_EMAIL }, select: { id: true } })) {
    return { ok: false, error: `${QA_OWNER_EMAIL} is already used by an account that is not in a QA church. Remove it first.` };
  }

  // 24 random bytes as base64url = 32 characters, with no look-alike punctuation.
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await hashPassword(password);
  const slug = `${INTERNAL_SLUG_PREFIX}${randomBytes(4).toString("hex")}`;
  const name = "zz QA (internal)";

  const church = await db.$transaction(async (tx) => {
    const c = await tx.church.create({
      data: {
        slug,
        name,
        isInternal: true,
        country: "Ghana",
        smsCredits: 0,
        termsAcceptedAt: new Date(),
        autoBackup: false,
        smsWelcomeMember: false,
        smsWelcomeVisitor: false,
        notifySubmissions: false,
        birthdayWishOn: false,
        branches: { create: { name: "Main Branch", isHQ: true } },
      },
      select: { id: true },
    });
    // Max with no end date (effectivePlan treats a null renewsAt as never expiring). No PlanPayment: no money moved.
    await tx.subscription.create({ data: { churchId: c.id, plan: "max", interval: "yearly", status: "active", renewsAt: null, autoRenew: false } });
    await tx.user.create({
      data: { churchId: c.id, email: QA_OWNER_EMAIL, name: "QA Owner", passwordHash, phone: null, role: "Owner", emailVerified: true },
    });
    return c;
  });

  await logAdminAction("qa_church_create", { churchId: church.id, slug });
  revalidatePath("/admin/accounts");
  return { ok: true, created: true, churchId: church.id, slug, name, email: QA_OWNER_EMAIL, password };
}
