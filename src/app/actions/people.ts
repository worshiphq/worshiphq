"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { memberLimitError } from "@/lib/member-limit";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, assertCanDelete } from "@/lib/auth";
import { getFormDefinition, questionFields } from "@/lib/forms/registration";
import { buildPersonData } from "@/lib/forms/person-data";
import { nextMemberId, resolveDepartmentIds, resolveGroupIds } from "@/lib/members/helpers";
import { logAudit } from "@/lib/audit";
import { RecycleBin } from "@/lib/recycle-bin";
import { saveMemberCategoryChoices } from "@/lib/members/categories";
import { cleanLeaderTitle, leaderTitleList } from "@/lib/leader-titles";
import type { PersonStatus } from "@prisma/client";

/**
 * The leadership label from the member form. "Add a new title" sends the new wording in its own box; a title the church has
 * not used before is added to its list, so it is there to pick next time.
 */
async function resolveLeaderTitle(churchId: string, formData: FormData): Promise<string | null> {
  let title = String(formData.get("leaderTitle") ?? "").trim();
  if (title === "__new__") title = String(formData.get("leaderTitleNew") ?? "");
  title = cleanLeaderTitle(title);
  if (!title) return null;
  const church = await db.church.findUnique({ where: { id: churchId }, select: { leaderTitles: true } });
  const list = leaderTitleList(church?.leaderTitles);
  if (!list.some((t) => t.toLowerCase() === title.toLowerCase())) {
    await db.church.update({ where: { id: churchId }, data: { leaderTitles: [...list, title] } });
  }
  return title;
}

async function formFields(churchId: string) {
  const church = await db.church.findUnique({
    where: { id: churchId },
    select: { registrationFields: true },
  });
  return questionFields(getFormDefinition(church?.registrationFields ?? null));
}

export async function createPerson(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session, "people");

  const fields = await formFields(session.churchId);
  const { data, customFields, departmentNames } = await buildPersonData(fields, formData);
  if (!data.firstName || !data.lastName) return { ok: false as const };

  const status = (String(formData.get("status") ?? "active") as PersonStatus) || "active";
  if (status !== "visitor") {
    const full = await memberLimitError(session.churchId);
    if (full) return { ok: false as const, error: full };
  }
  const leaderTitle = await resolveLeaderTitle(session.churchId, formData);
  const featured = formData.get("featured") === "true";
  const deptIds = await resolveDepartmentIds(session.churchId, departmentNames);
  const adminGroups = await resolveGroupIds(session.churchId, formData.getAll("groups").map(String));
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
      ...(adminGroups.length ? { groups: { connect: adminGroups.map((id) => ({ id })) } } : {}),
    },
  });

  await saveMemberCategoryChoices(session.churchId, person.id, formData);
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "person", entityId: person.id, detail: `Added ${data.firstName} ${data.lastName}` });
  revalidatePath("/app/people");
  revalidatePath("/app");
  return { ok: true as const, personId: person.id, name: `${data.firstName} ${data.lastName}` };
}

/** useActionState wrapper so the admin add-member modal can grab the new
 *  personId and offer fingerprint enrollment right after saving. */
export async function createPersonState(_prev: unknown, formData: FormData) {
  return createPerson(formData);
}

export async function updatePerson(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session, "people");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Ensure the record belongs to this church before touching relations.
  const existing = await db.person.findFirst({ where: { id, churchId: session.churchId }, select: { id: true, status: true } });
  if (!existing) return;

  const fields = await formFields(session.churchId);
  const { data, customFields, departmentNames } = await buildPersonData(fields, formData);
  const status = (String(formData.get("status") ?? "active") as PersonStatus) || "active";
  const leaderTitle = await resolveLeaderTitle(session.churchId, formData);
  const featured = formData.get("featured") === "true";
  const deptIds = await resolveDepartmentIds(session.churchId, departmentNames);
  // The edit form always includes the groups section, so what it sends is the full list.
  const groupSet = formData.get("groupsForm")
    ? { groups: { set: (await resolveGroupIds(session.churchId, formData.getAll("groups").map(String))).map((g) => ({ id: g })) } }
    : {};

  // Admin-editable member ID (unique per church).
  const memberId = String(formData.get("memberId") ?? "").trim() || null;

  // Returning to active clears the "we miss you" dedupe guard, so a future
  // lapse is free to text them again instead of staying silenced forever.
  let statusFields: { status: PersonStatus; lapsedSmsSentAt?: null } = status === "active" ? { status, lapsedSmsSentAt: null } : { status };
  // A visitor only becomes a member if the plan has room; otherwise they stay a visitor.
  if (existing.status === "visitor" && status !== "visitor" && (await memberLimitError(session.churchId))) {
    statusFields = { status: "visitor" as PersonStatus };
  }

  try {
    await db.person.update({
      where: { id },
      data: {
        ...(data as Prisma.PersonUpdateInput),
        ...statusFields,
        leaderTitle,
        featured,
        memberId,
        ...(Object.keys(customFields).length ? { customFields } : {}),
        departments: { set: deptIds.map((d) => ({ id: d })) },
        department: deptIds.length ? { connect: { id: deptIds[0] } } : { disconnect: true },
        ...groupSet,
      },
    });
  } catch {
    // Likely a duplicate member ID - retry without changing it.
    await db.person.update({
      where: { id },
      data: {
        ...(data as Prisma.PersonUpdateInput),
        ...statusFields,
        leaderTitle,
        featured,
        ...(Object.keys(customFields).length ? { customFields } : {}),
        departments: { set: deptIds.map((d) => ({ id: d })) },
        department: deptIds.length ? { connect: { id: deptIds[0] } } : { disconnect: true },
        ...groupSet,
      },
    });
  }
  await saveMemberCategoryChoices(session.churchId, id, formData);

  revalidatePath("/app/people");
  revalidatePath("/app");
}

export async function deletePerson(id: string) {
  const session = await requireSession();
  assertCanDelete(session);
  const person = await db.person.findFirst({ where: { id, churchId: session.churchId }, select: { firstName: true, lastName: true } });
  await RecycleBin.capturePerson(session, id);
  await db.person.deleteMany({ where: { id, churchId: session.churchId } });
  if (person) await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "person", entityId: id, detail: `Deleted ${person.firstName} ${person.lastName}` });
  revalidatePath("/app/people");
  revalidatePath("/app");
}
