"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, assertCanDelete } from "@/lib/auth";

export async function deleteAssignment(id: string) {
  const session = await requireSession();
  assertCanDelete(session);
  await db.volunteerAssignment.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/volunteers");
}

export async function scheduleAssignment(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const personName = String(formData.get("person") ?? "").trim();
  const team = String(formData.get("team") ?? "").trim();
  if (!personName || !team) return;
  const dateStr = String(formData.get("date") ?? "");

  await db.volunteerAssignment.create({
    data: {
      churchId: session.churchId,
      team,
      role: String(formData.get("role") ?? "Volunteer"),
      personName,
      serviceDate: dateStr ? new Date(dateStr) : new Date(),
      confirmed: false,
    },
  });

  revalidatePath("/app/volunteers");
}

export async function toggleAssignment(id: string, confirmed: boolean) {
  const session = await requireSession();
  assertCanWrite(session);
  await db.volunteerAssignment.updateMany({
    where: { id, churchId: session.churchId },
    data: { confirmed },
  });
  revalidatePath("/app/volunteers");
}
