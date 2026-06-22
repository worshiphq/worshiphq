"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";

const VALID_POSITIONS = [
  "Head", "Assistant Head", "Secretary", "Treasurer",
  "Coordinator", "Vice President", "President",
] as const;

export async function addPosition(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin" && session.role !== "Pastor") return;

  const personId = String(formData.get("personId") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "").trim();
  const position = String(formData.get("position") ?? "").trim();
  if (!personId || !departmentId || !position) return;

  const person = await db.person.findFirst({ where: { id: personId, churchId: session.churchId } });
  if (!person) return;

  const dept = await db.department.findFirst({ where: { id: departmentId, churchId: session.churchId } });
  if (!dept) return;

  await db.departmentPosition.upsert({
    where: { personId_departmentId_position: { personId, departmentId, position } },
    create: { churchId: session.churchId, personId, departmentId, position },
    update: {},
  });

  revalidatePath("/app/people");
  revalidatePath("/app/leaders");
  revalidatePath("/app");
}

export async function removePosition(id: string) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin" && session.role !== "Pastor") return;

  await db.departmentPosition.deleteMany({
    where: { id, churchId: session.churchId },
  });

  revalidatePath("/app/people");
  revalidatePath("/app/leaders");
  revalidatePath("/app");
}
