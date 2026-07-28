"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function createDepartment(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!name) return;

  // Upsert — if it already exists by name for this church, ignore
  const existing = await db.department.findUnique({
    where: { churchId_name: { churchId: session.churchId, name } },
  });
  if (existing) return;

  const dept = await db.department.create({
    data: { churchId: session.churchId, name, description },
  });

  await audit(session, "create", "department", `Created department "${name}"`, dept.id);
  revalidatePath("/app/settings");
  revalidatePath("/app/people");
}

export async function deleteDepartment(id: string) {
  const session = await requireSession();
  assertCanWrite(session);
  const dept = await db.department.findFirst({ where: { id, churchId: session.churchId }, select: { name: true } });
  // Unlink people first, then delete
  await db.person.updateMany({
    where: { churchId: session.churchId, departmentId: id },
    data: { departmentId: null },
  });
  await db.department.deleteMany({
    where: { id, churchId: session.churchId },
  });
  if (dept) await audit(session, "delete", "department", `Deleted department "${dept.name}"`, id);
  revalidatePath("/app/settings");
  revalidatePath("/app/people");
}
