"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, hashPassword } from "@/lib/auth";
import type { Role } from "@prisma/client";

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
      logoUrl: String(formData.get("logoUrl") ?? "").trim() || null,
    },
  });

  revalidatePath("/app/settings");
  revalidatePath("/app");
}

export async function updateBranding(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  await db.church.update({
    where: { id: session.churchId },
    data: { accentColor: String(formData.get("accentColor") ?? "#5b43db") },
  });
  revalidatePath("/app/settings");
}

/** Update which fields appear on the public join form. */
export async function updateRegistrationFields(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") return;

  // Build the config from checkbox values
  const config: Record<string, boolean> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("field_")) {
      config[key.replace("field_", "")] = value === "on";
    }
  }

  await db.church.update({
    where: { id: session.churchId },
    data: { registrationFields: config },
  });

  revalidatePath("/app/settings");
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
