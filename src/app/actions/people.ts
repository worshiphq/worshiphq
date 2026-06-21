"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, assertCanDelete } from "@/lib/auth";
import { getFormDefinition } from "@/lib/forms/registration";
import { buildPersonData } from "@/lib/forms/person-data";
import { nextMemberId, resolveDepartmentIds } from "@/lib/members/helpers";
import { logAudit } from "@/lib/audit";
import type { PersonStatus } from "@prisma/client";

async function formFields(churchId: string) {
  const church = await db.church.findUnique({
    where: { id: churchId },
    select: { registrationFields: true },
  });
  return getFormDefinition(church?.registrationFields ?? null);
}

export async function createPerson(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const fields = await formFields(session.churchId);
  const { data, customFields, departmentNames } = buildPersonData(fields, formData);
  if (!data.firstName || !data.lastName) return;

  const status = (String(formData.get("status") ?? "active") as PersonStatus) || "active";
  const leaderTitle = String(formData.get("leaderTitle") ?? "").trim() || null;
  const featured = formData.get("featured") === "true";
  const deptIds = await resolveDepartmentIds(session.churchId, departmentNames);
  const memberId = await nextMemberId(session.churchId);

  const person = await db.person.create({
    data: {
      ...(data as Prisma.PersonCreateInput),
      church: { connect: { id: session.churchId } },
      branch: session.branchId ? { connect: { id: session.branchId } } : undefined,
      status,
      leaderTitle,
      featured,
      memberId,
      ...(Object.keys(customFields).length ? { customFields } : {}),
      ...(deptIds.length
        ? { departments: { connect: deptIds.map((id) => ({ id })) }, department: { connect: { id: deptIds[0] } } }
        : {}),
    },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "person", entityId: person.id, detail: `Added ${data.firstName} ${data.lastName}` });
  revalidatePath("/app/people");
  revalidatePath("/app");
}

export async function updatePerson(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Ensure the record belongs to this church before touching relations.
  const existing = await db.person.findFirst({ where: { id, churchId: session.churchId }, select: { id: true } });
  if (!existing) return;

  const fields = await formFields(session.churchId);
  const { data, customFields, departmentNames } = buildPersonData(fields, formData);
  const status = (String(formData.get("status") ?? "active") as PersonStatus) || "active";
  const leaderTitle = String(formData.get("leaderTitle") ?? "").trim() || null;
  const featured = formData.get("featured") === "true";
  const deptIds = await resolveDepartmentIds(session.churchId, departmentNames);

  // Admin-editable member ID (unique per church).
  const memberId = String(formData.get("memberId") ?? "").trim() || null;

  try {
    await db.person.update({
      where: { id },
      data: {
        ...(data as Prisma.PersonUpdateInput),
        status,
        leaderTitle,
        featured,
        memberId,
        ...(Object.keys(customFields).length ? { customFields } : {}),
        departments: { set: deptIds.map((d) => ({ id: d })) },
        department: deptIds.length ? { connect: { id: deptIds[0] } } : { disconnect: true },
      },
    });
  } catch {
    // Likely a duplicate member ID — retry without changing it.
    await db.person.update({
      where: { id },
      data: {
        ...(data as Prisma.PersonUpdateInput),
        status,
        leaderTitle,
        featured,
        ...(Object.keys(customFields).length ? { customFields } : {}),
        departments: { set: deptIds.map((d) => ({ id: d })) },
        department: deptIds.length ? { connect: { id: deptIds[0] } } : { disconnect: true },
      },
    });
  }

  revalidatePath("/app/people");
}

export async function deletePerson(id: string) {
  const session = await requireSession();
  assertCanDelete(session);
  const person = await db.person.findFirst({ where: { id, churchId: session.churchId }, select: { firstName: true, lastName: true } });
  await db.person.deleteMany({ where: { id, churchId: session.churchId } });
  if (person) await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "person", entityId: id, detail: `Deleted ${person.firstName} ${person.lastName}` });
  revalidatePath("/app/people");
  revalidatePath("/app");
}
