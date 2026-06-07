"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import type { PersonStatus } from "@prisma/client";

function fieldsFrom(formData: FormData) {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const birthday = String(formData.get("birthday") ?? "").trim() || null; // MM-DD
  const status = (String(formData.get("status") ?? "active") as PersonStatus) || "active";
  return { firstName, lastName, email, phone, location, birthday, status };
}

export async function createPerson(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  const data = fieldsFrom(formData);
  if (!data.firstName || !data.lastName) return;
  await db.person.create({
    data: { ...data, churchId: session.churchId, branchId: session.branchId ?? undefined },
  });
  revalidatePath("/app/people");
  revalidatePath("/app");
}

export async function updatePerson(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const data = fieldsFrom(formData);
  // Scope the update to this church so one tenant can never edit another's record.
  await db.person.updateMany({ where: { id, churchId: session.churchId }, data });
  revalidatePath("/app/people");
}

export async function deletePerson(id: string) {
  const session = await requireSession();
  assertCanWrite(session);
  await db.person.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/people");
  revalidatePath("/app");
}
