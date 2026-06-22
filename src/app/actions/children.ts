"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { nextMemberId } from "@/lib/members/helpers";
import { logAudit } from "@/lib/audit";

export async function createChild(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName || !lastName) return;

  const ageGroup = String(formData.get("ageGroup") ?? "child");
  const gender = String(formData.get("gender") ?? "").trim() || null;
  const dateOfBirth = formData.get("dateOfBirth") ? new Date(String(formData.get("dateOfBirth"))) : null;
  const school = String(formData.get("school") ?? "").trim() || null;
  const grade = String(formData.get("grade") ?? "").trim() || null;
  const guardianName = String(formData.get("guardianName") ?? "").trim() || null;
  const guardianPhone = String(formData.get("guardianPhone") ?? "").trim() || null;
  const parentId = String(formData.get("parentId") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const memberId = await nextMemberId(session.churchId);

  const birthday = dateOfBirth && !isNaN(dateOfBirth.getTime())
    ? `${String(dateOfBirth.getMonth() + 1).padStart(2, "0")}-${String(dateOfBirth.getDate()).padStart(2, "0")}`
    : null;

  const person = await db.person.create({
    data: {
      church: { connect: { id: session.churchId } },
      branch: session.branchId ? { connect: { id: session.branchId } } : undefined,
      firstName,
      lastName,
      ageGroup,
      gender,
      dateOfBirth: dateOfBirth && !isNaN(dateOfBirth.getTime()) ? dateOfBirth : null,
      birthday,
      school,
      grade,
      guardianName,
      guardianPhone,
      phone,
      memberId,
      parent: parentId ? { connect: { id: parentId } } : undefined,
      status: "active",
    },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "person", entityId: person.id, detail: `Added ${ageGroup} ${firstName} ${lastName}` });
  revalidatePath("/app/children");
  revalidatePath("/app/people");
  revalidatePath("/app");
}

export async function updateChild(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const existing = await db.person.findFirst({ where: { id, churchId: session.churchId }, select: { id: true } });
  if (!existing) return;

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const ageGroup = String(formData.get("ageGroup") ?? "child");
  const gender = String(formData.get("gender") ?? "").trim() || null;
  const dateOfBirth = formData.get("dateOfBirth") ? new Date(String(formData.get("dateOfBirth"))) : null;
  const school = String(formData.get("school") ?? "").trim() || null;
  const grade = String(formData.get("grade") ?? "").trim() || null;
  const guardianName = String(formData.get("guardianName") ?? "").trim() || null;
  const guardianPhone = String(formData.get("guardianPhone") ?? "").trim() || null;
  const parentId = String(formData.get("parentId") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;

  const birthday = dateOfBirth && !isNaN(dateOfBirth.getTime())
    ? `${String(dateOfBirth.getMonth() + 1).padStart(2, "0")}-${String(dateOfBirth.getDate()).padStart(2, "0")}`
    : null;

  await db.person.update({
    where: { id },
    data: {
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      ageGroup,
      gender,
      dateOfBirth: dateOfBirth && !isNaN(dateOfBirth.getTime()) ? dateOfBirth : null,
      birthday,
      school,
      grade,
      guardianName,
      guardianPhone,
      phone,
      parent: parentId ? { connect: { id: parentId } } : { disconnect: true },
    },
  });

  revalidatePath("/app/children");
  revalidatePath("/app/people");
}

export async function assignParent(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const childId = String(formData.get("childId") ?? "");
  const parentId = String(formData.get("parentId") ?? "").trim();
  if (!childId) return;

  const child = await db.person.findFirst({ where: { id: childId, churchId: session.churchId }, select: { id: true, firstName: true, lastName: true } });
  if (!child) return;

  if (parentId) {
    const parent = await db.person.findFirst({ where: { id: parentId, churchId: session.churchId }, select: { id: true } });
    if (!parent) return;
    await db.person.update({ where: { id: childId }, data: { parent: { connect: { id: parentId } } } });
  } else {
    await db.person.update({ where: { id: childId }, data: { parent: { disconnect: true } } });
  }

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "update", entity: "person", entityId: childId, detail: `Assigned parent for ${child.firstName} ${child.lastName}` });
  revalidatePath("/app/children");
}
