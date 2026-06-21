"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  checkSuperAdmin,
  startSuperAdminSession,
  startGhostSession,
  stopGhostSession,
  clearSession,
  requireSuperAdmin,
} from "@/lib/auth";
import { saveMarketingContent, type MarketingContent } from "@/lib/data/site-content";
import { sendSms } from "@/lib/integrations/sms";
import { addCredits } from "@/lib/sms/credits";

// ── Auth ──
export async function superAdminSignIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!checkSuperAdmin(email, password)) {
    redirect("/admin/login?error=invalid");
  }
  await startSuperAdminSession();
  redirect("/admin");
}

export async function superAdminSignOut() {
  await clearSession();
  redirect("/admin/login");
}

// ── Impersonation ──
export async function impersonateChurch(churchId: string) {
  await requireSuperAdmin();
  const church = await db.church.findUnique({ where: { id: churchId }, select: { id: true } });
  if (!church) return;
  await startGhostSession(church.id);
  redirect("/app");
}

/** Called from the app shell banner to return to the admin area. */
export async function exitImpersonation() {
  await requireSuperAdmin();
  await stopGhostSession();
  redirect("/admin");
}

// ── Church management ──
export async function setChurchSuspended(churchId: string, suspended: boolean) {
  await requireSuperAdmin();
  await db.church.update({ where: { id: churchId }, data: { suspended } });
  revalidatePath("/admin");
}

export async function approveSenderId(churchId: string) {
  await requireSuperAdmin();

  const church = await db.church.update({
    where: { id: churchId },
    data: {
      smsSenderIdStatus: "approved",
    },
    select: {
      name: true,
      smsSenderId: true,
    },
  });

  const owner = await db.user.findFirst({
    where: {
      churchId,
      phoneVerified: true,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      phone: true,
    },
  });

  console.log("OWNER PHONE:", owner?.phone);

  if (owner?.phone) {
    await sendSms(
      owner.phone,
      `Congratulations!

Your Sender ID "${church.smsSenderId}" has been approved.

You can now use it for SMS broadcasts in WorshipHQ.`,
      { heading: null }
    );
  }

  revalidatePath("/admin");
}

export async function rejectSenderId(churchId: string) {
  await requireSuperAdmin();

  const church = await db.church.update({
    where: { id: churchId },
    data: {
      smsSenderIdStatus: "rejected",
    },
    select: {
      smsSenderId: true,
    },
  });

  const owner = await db.user.findFirst({
    where: {
      churchId,
      phoneVerified: true,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      phone: true,
    },
  });

  if (owner?.phone) {
    await sendSms(
      owner.phone,
      `Your Sender ID "${church.smsSenderId}" was not approved.

Please contact WorshipHQ for assistance.

Email: worshiphqapp@gmail.com
Phone: +233247258161`,
      { heading: null }
    );
  }

  revalidatePath("/admin");
}

export async function setChurchPlan(churchId: string, plan: string) {
  await requireSuperAdmin();
  await db.subscription.upsert({
    where: { churchId },
    create: { churchId, plan },
    update: { plan },
  });
  revalidatePath("/admin");
}

export async function grantPlanBypass(churchId: string, plan: string) {
  await requireSuperAdmin();
  const validPlans = ["starter", "growth", "unlimited"];
  if (!validPlans.includes(plan)) return { error: "Invalid plan" };

  const church = await db.church.findUnique({
    where: { id: churchId },
    select: { name: true, id: true },
  });
  if (!church) return { error: "Church not found" };

  const owner = await db.user.findFirst({
    where: { churchId, role: "Owner" },
    select: { phone: true, name: true },
  });

  const code = String(Math.floor(100000 + Math.random() * 900000));

  await db.subscription.upsert({
    where: { churchId },
    create: { churchId, plan: "free", bypassPlan: plan, bypassCode: code },
    update: { bypassPlan: plan, bypassCode: code },
  });

  if (owner?.phone) {
    const planNames: Record<string, string> = { starter: "Starter", growth: "Growth", unlimited: "Unlimited" };
    await sendSms(
      owner.phone,
      `WorshipHQ: You've been granted a free upgrade to the ${planNames[plan]} plan! Go to Settings → Billing and enter code: ${code} to activate. — WorshipHQ Team`,
      { heading: null },
    );
  }

  revalidatePath("/admin");
  return { ok: true, code, phone: owner?.phone ?? null };
}

export async function grantSmsCredits(churchId: string, credits: number) {
  await requireSuperAdmin();
  if (!credits || !Number.isFinite(credits)) return;
  await addCredits(churchId, Math.round(credits), "bonus", { note: "Granted by WorshipHQ" });
  revalidatePath("/admin");
}

export async function deleteChurch(churchId: string) {
  await requireSuperAdmin();
  const church = await db.church.findUnique({ where: { id: churchId }, select: { isDemo: true } });
  if (!church || church.isDemo) return; // never delete the demo church
  await db.church.delete({ where: { id: churchId } });
  revalidatePath("/admin");
}

// ── Marketing content ──
export async function saveMarketing(formData: FormData) {
  await requireSuperAdmin();
  const heroSubhead = String(formData.get("heroSubhead") ?? "").trim();

  // Testimonials arrive as parallel indexed fields.
  const quotes = formData.getAll("t_quote").map(String);
  const names = formData.getAll("t_name").map(String);
  const roles = formData.getAll("t_role").map(String);
  const churches = formData.getAll("t_church").map(String);
  const testimonials = quotes
    .map((quote, i) => ({
      quote: quote.trim(),
      name: (names[i] ?? "").trim(),
      role: (roles[i] ?? "").trim(),
      church: (churches[i] ?? "").trim(),
    }))
    .filter((t) => t.quote && t.name);

  const content: MarketingContent = { heroSubhead, testimonials };
  await saveMarketingContent(content);
  revalidatePath("/admin/content");
  revalidatePath("/", "layout");
}

// ── Announcements / broadcast ──
export async function createAnnouncement(formData: FormData) {
  await requireSuperAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const level = String(formData.get("level") ?? "info").trim() || "info";
  if (!title || !body) return;
  const endsRaw = String(formData.get("endsAt") ?? "").trim();
  const endsAt = endsRaw ? new Date(endsRaw) : null;
  await db.announcement.create({
    data: { title, body, level, active: true, endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : null },
  });
  revalidatePath("/admin/broadcast");
}

export async function toggleAnnouncement(id: string, active: boolean) {
  await requireSuperAdmin();
  await db.announcement.update({ where: { id }, data: { active } });
  revalidatePath("/admin/broadcast");
}

export async function deleteAnnouncement(id: string) {
  await requireSuperAdmin();
  await db.announcement.delete({ where: { id } });
  revalidatePath("/admin/broadcast");
}
