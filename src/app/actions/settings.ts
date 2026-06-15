"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, hashPassword } from "@/lib/auth";
import { getFormDefinition } from "@/lib/forms/registration";
import type { Role } from "@prisma/client";

/** Update the signed-in user's own display name (and optional email). */
export async function updateProfile(formData: FormData) {
  const session = await requireSession();
  // Demo and impersonation sessions aren't backed by a real user row.
  if (session.isDemo || session.impersonating) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const data: { name: string; email?: string } = { name };

  // Allow changing email only if it isn't taken by someone else.
  if (email && email !== session.email) {
    const taken = await db.user.findUnique({ where: { email } });
    if (!taken) data.email = email;
  }

  await db.user.update({ where: { id: session.userId }, data });

  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
}

export async function updateChurch(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await db.church.update({
    where: { id: session.churchId },
    data: {
      name,
      denomination: String(formData.get("denomination") ?? "").trim() || null,
      city: String(formData.get("city") ?? "").trim() || null,
      country: String(formData.get("country") ?? "Ghana").trim() || "Ghana",
      address: String(formData.get("address") ?? "").trim() || null,
      // logoUrl is managed in the Branding tab (updateBranding), not here.
    },
  });

  revalidatePath("/app/settings");
  revalidatePath("/app");
}

export async function updateBranding(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const accentColor = String(formData.get("accentColor") ?? "#0d7377");
  // logoUrl is a data URL (base64) or empty to clear. Cap size (~1.5MB base64).
  const logoRaw = String(formData.get("logoUrl") ?? "");
  const data: { accentColor: string; logoUrl?: string | null } = { accentColor };
  if (formData.has("logoUrl")) {
    if (!logoRaw) data.logoUrl = null;
    else if (logoRaw.startsWith("data:image/") && logoRaw.length < 1_500_000) data.logoUrl = logoRaw;
  }

  await db.church.update({ where: { id: session.churchId }, data });
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
}

/** Save the full registration form definition (from the form builder). */
export async function saveRegistrationForm(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  const raw = String(formData.get("definition") ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  // Normalise through getFormDefinition so we only ever store valid fields.
  const fields = getFormDefinition(parsed);

  await db.church.update({
    where: { id: session.churchId },
    data: { registrationFields: fields as object },
  });

  revalidatePath("/app/settings");
  revalidatePath("/join", "layout");
}

/** Invite a teammate — creates a User in this church with a temporary password. */
export async function inviteTeammate(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "Volunteer") as Role;
  if (!email || !name) return;

  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return;

  const tempPassword = String(formData.get("password") ?? "").trim() || "changeme123";
  await db.user.create({
    data: {
      churchId: session.churchId,
      email,
      name,
      role,
      passwordHash: await hashPassword(tempPassword),
    },
  });

  revalidatePath("/app/settings");
}

/** Change a team member's role (Owner/Admin only). */
export async function changeUserRole(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  const userId = String(formData.get("userId") ?? "").trim();
  const newRole = String(formData.get("role") ?? "").trim() as Role;
  if (!userId || !newRole) return;

  // Can't change your own role or promote beyond your own
  if (userId === session.userId) return;
  // Only Owner can make someone else Owner
  if (newRole === "Owner" && session.role !== "Owner") return;

  await db.user.updateMany({
    where: { id: userId, churchId: session.churchId },
    data: { role: newRole },
  });

  revalidatePath("/app/settings");
}

/** Remove a team member (Owner/Admin only, can't remove yourself). */
export async function removeTeamMember(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId || userId === session.userId) return;

  // Can't remove Owner
  const target = await db.user.findFirst({ where: { id: userId, churchId: session.churchId } });
  if (!target || target.role === "Owner") return;

  await db.user.delete({ where: { id: userId } });
  revalidatePath("/app/settings");
}
