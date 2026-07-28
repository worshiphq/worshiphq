"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function createGroup(formData: FormData) {
  const session = await requireModule("people");
  if (session.isDemo) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const type = String(formData.get("type") ?? "small_group");
  const description = String(formData.get("description") ?? "").trim() || null;
  const meetingDay = String(formData.get("meetingDay") ?? "").trim() || null;
  const meetingTime = String(formData.get("meetingTime") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const leaderId = String(formData.get("leaderId") ?? "").trim() || null;

  const group = await db.group.create({
    data: {
      churchId: session.churchId,
      name,
      type,
      description,
      meetingDay,
      meetingTime,
      location,
      leaderId,
    },
  });

  await audit(session, "create", "group", `Created group "${name}"`, group.id);
  revalidatePath("/app/groups");
}

export async function updateGroup(formData: FormData) {
  const session = await requireModule("people");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const type = String(formData.get("type") ?? "small_group");
  const description = String(formData.get("description") ?? "").trim() || null;
  const meetingDay = String(formData.get("meetingDay") ?? "").trim() || null;
  const meetingTime = String(formData.get("meetingTime") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const leaderId = String(formData.get("leaderId") ?? "").trim() || null;

  await db.group.updateMany({
    where: { id, churchId: session.churchId },
    data: {
      name,
      type,
      description,
      meetingDay,
      meetingTime,
      location,
      leaderId,
    },
  });

  await audit(session, "update", "group", `Updated group "${name}"`, id);
  revalidatePath("/app/groups");
  revalidatePath(`/app/groups/${id}`);
}

export async function deleteGroup(formData: FormData) {
  const session = await requireModule("people");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const group = await db.group.findFirst({ where: { id, churchId: session.churchId }, select: { name: true } });

  await db.group.deleteMany({
    where: { id, churchId: session.churchId },
  });

  if (group) await audit(session, "delete", "group", `Deleted group "${group.name}"`, id);
  revalidatePath("/app/groups");
}

export async function addGroupMember(formData: FormData) {
  const session = await requireModule("people");
  if (session.isDemo) return;

  const groupId = String(formData.get("groupId"));
  const personId = String(formData.get("personId"));

  await db.group.update({
    where: { id: groupId, churchId: session.churchId },
    data: { members: { connect: { id: personId } } },
  });

  revalidatePath(`/app/groups/${groupId}`);
}

export async function removeGroupMember(formData: FormData) {
  const session = await requireModule("people");
  if (session.isDemo) return;

  const groupId = String(formData.get("groupId"));
  const personId = String(formData.get("personId"));

  await db.group.update({
    where: { id: groupId, churchId: session.churchId },
    data: { members: { disconnect: { id: personId } } },
  });

  revalidatePath(`/app/groups/${groupId}`);
}
