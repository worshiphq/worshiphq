"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import type { PersonStatus } from "@prisma/client";

function fieldsFrom(formData: FormData) {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const otherNames = String(formData.get("otherNames") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const birthday = String(formData.get("birthday") ?? "").trim() || null; // MM-DD
  const status = (String(formData.get("status") ?? "active") as PersonStatus) || "active";

  // Rich fields
  const gender = String(formData.get("gender") ?? "").trim() || null;
  const title = String(formData.get("title") ?? "").trim() || null;
  const occupation = String(formData.get("occupation") ?? "").trim() || null;
  const maritalStatus = String(formData.get("maritalStatus") ?? "").trim() || null;
  const region = String(formData.get("region") ?? "").trim() || null;
  const town = String(formData.get("town") ?? "").trim() || null;
  const homeTown = String(formData.get("homeTown") ?? "").trim() || null;
  const nationality = String(formData.get("nationality") ?? "").trim() || null;
  const nationalId = String(formData.get("nationalId") ?? "").trim() || null;
  const houseAddress = String(formData.get("houseAddress") ?? "").trim() || null;

  // Date of birth
  let dateOfBirth: Date | null = null;
  const dobStr = String(formData.get("dateOfBirth") ?? "").trim();
  if (dobStr) {
    const d = new Date(dobStr);
    if (!isNaN(d.getTime())) dateOfBirth = d;
  }

  // Department
  const departmentId = String(formData.get("departmentId") ?? "").trim() || null;

  // Emergency
  const emergencyName = String(formData.get("emergencyName") ?? "").trim() || null;
  const emergencyPhone = String(formData.get("emergencyPhone") ?? "").trim() || null;
  const emergencyRelation = String(formData.get("emergencyRelation") ?? "").trim() || null;

  return {
    firstName, lastName, otherNames, email, phone, location, birthday, status,
    gender, title, occupation, maritalStatus, region, town, homeTown,
    nationality, nationalId, houseAddress, dateOfBirth, departmentId,
    emergencyName, emergencyPhone, emergencyRelation,
  };
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
