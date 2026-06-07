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
