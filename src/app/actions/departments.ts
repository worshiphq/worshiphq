"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { moveToBin } from "@/lib/recycle-bin";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ensureDepartmentOnForm } from "@/lib/forms/ensure-department";

export async function createDepartment(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session, "settings");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!name) return;

  // Upsert - if it already exists by name for this church, ignore
  const existing = await db.department.findUnique({
    where: { churchId_name: { churchId: session.churchId, name } },
  });
  if (existing) return;

  const first = (await db.department.count({ where: { churchId: session.churchId } })) === 0;
  const dept = await db.department.create({
    data: { churchId: session.churchId, name, description },
  });
  // The first department turns on the "Department / ministry" question on the member and join forms.
  if (first) await ensureDepartmentOnForm(session.churchId);

  await audit(session, "create", "department", `Created department "${name}"`, dept.id);
  revalidatePath("/app/settings");
  revalidatePath("/app/people");
}

/**
 * Add people to a department in one go.
 *
 * Until now the only way in was to edit each member one at a time, which is fine when the
 * departments existed first and brutal when they did not: a church that adds its departments after
 * its members had to open two hundred profiles. This is the same move Groups already has.
 *
 * Also fills the legacy single-department link when the person has none, so department-based
 * reports and the attendance breakdown, which still read that field, pick them up.
 */
export async function addDepartmentMembers(departmentId: string, personIds: string[]) {
  const session = await requireSession();
  assertCanWrite(session, "people");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };

  const dept = await db.department.findFirst({
    where: { id: departmentId, churchId: session.churchId },
    select: { id: true, name: true },
  });
  if (!dept) return { ok: false as const, error: "Department not found." };

  const found = await db.person.findMany({
    where: { churchId: session.churchId, id: { in: personIds.slice(0, 500) } },
    select: { id: true, departmentId: true },
  });
  // People locked by the plan's member limit are skipped.
  const { lockedAmong } = await import("@/lib/member-lock");
  const locked = new Set(await lockedAmong(session.churchId, found.map((p) => p.id)));
  const valid = found.filter((p) => !locked.has(p.id));
  if (valid.length === 0) {
    const { LOCKED_ADD } = await import("@/lib/member-lock-core");
    return { ok: false as const, error: locked.size ? LOCKED_ADD : "Pick at least one person." };
  }

  await db.department.update({
    where: { id: dept.id },
    data: { members: { connect: valid.map((p) => ({ id: p.id })) } },
  });
  const noPrimary = valid.filter((p) => !p.departmentId).map((p) => p.id);
  if (noPrimary.length) {
    await db.person.updateMany({ where: { id: { in: noPrimary } }, data: { departmentId: dept.id } });
  }

  await audit(session, "update", "department", `Added ${valid.length} to "${dept.name}"`, dept.id);
  revalidatePath(`/app/departments/${dept.id}`);
  revalidatePath("/app/people");
  revalidatePath("/app/settings");
  return { ok: true as const, added: valid.length, skippedLocked: locked.size };
}

export async function removeDepartmentMember(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session, "people");
  if (session.isDemo) return;

  const departmentId = String(formData.get("departmentId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  const dept = await db.department.findFirst({ where: { id: departmentId, churchId: session.churchId }, select: { id: true } });
  const person = await db.person.findFirst({ where: { id: personId, churchId: session.churchId }, select: { id: true } });
  if (!dept || !person) return;

  await db.department.update({ where: { id: dept.id }, data: { members: { disconnect: { id: person.id } } } });
  // The legacy single link would otherwise still point at a department they are no longer in.
  await db.person.updateMany({ where: { id: person.id, departmentId: dept.id }, data: { departmentId: null } });

  revalidatePath(`/app/departments/${dept.id}`);
  revalidatePath("/app/people");
}

export async function deleteDepartment(id: string) {
  const session = await requireSession();
  assertCanWrite(session, "settings");
  const dept = await db.department.findFirst({ where: { id, churchId: session.churchId }, select: { name: true } });
  await moveToBin(session, "department", "Department", id);
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
