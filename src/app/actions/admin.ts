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

export async function setChurchPlan(churchId: string, plan: string) {
  await requireSuperAdmin();
  await db.subscription.upsert({
    where: { churchId },
    create: { churchId, plan },
    update: { plan },
  });
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
