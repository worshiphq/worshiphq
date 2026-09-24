"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getVisitorFormDefinition } from "@/lib/forms/registration";

export async function submitVisitorForm(formData: FormData) {
  const churchSlug = String(formData.get("churchSlug") ?? "").trim();
  if (!churchSlug) return;

  const church = await db.church.findUnique({
    where: { slug: churchSlug },
    select: { id: true, isDemo: true, visitorFormFields: true },
  });
  if (!church || church.isDemo) return;

  const fields = getVisitorFormDefinition(church.visitorFormFields);

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName || !lastName) return;

  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const purpose = String(formData.get("purpose") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const customFields: Record<string, string> = {};
  for (const f of fields) {
    if (f.system || f.locked) continue;
    const val = String(formData.get(f.id) ?? "").trim();
    if (val) customFields[f.id] = val;
  }

  const person = await db.person.create({
    data: {
      churchId: church.id,
      firstName,
      lastName,
      phone,
      email,
      status: "visitor",
    },
  });

  const visitor = await db.visitor.create({
    data: {
      church: { connect: { id: church.id } },
      personId: person.id,
      firstName,
      lastName,
      phone,
      email,
      purpose,
      notes,
      ...(Object.keys(customFields).length ? { customFields } : {}),
    },
  });

  await db.followUp.create({
    data: {
      church: { connect: { id: church.id } },
      visitor: { connect: { id: visitor.id } },
      type: "new_visitor",
      title: `Follow up with visitor ${firstName} ${lastName}`,
      note: [purpose && `Purpose: ${purpose}`, notes && `Notes: ${notes}`].filter(Boolean).join(". ") || null,
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    },
  });

  redirect(`/visit/${churchSlug}/thank-you`);
}

/** Admin-side manual visitor entry - for when people signed a paper sheet
 *  in person rather than using the share link. */
export async function addVisitor(formData: FormData) {
  const { requireSession, assertCanWrite } = await import("@/lib/auth");
  const session = await requireSession();
  assertCanWrite(session);

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName) return;

  const visitDateStr = String(formData.get("visitDate") ?? "").trim();

  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const photoUrl = String(formData.get("photoUrl") ?? "").trim() || null;
  const invitedByIdRaw = String(formData.get("invitedById") ?? "").trim() || null;
  const invitedById = invitedByIdRaw
    ? (await db.person.findFirst({ where: { id: invitedByIdRaw, churchId: session.churchId }, select: { id: true } }))?.id ?? null
    : null;

  const person = await db.person.create({
    data: {
      churchId: session.churchId,
      firstName,
      lastName: lastName || "",
      phone,
      email,
      status: "visitor",
      photoUrl,
    },
  });

  const v = await db.visitor.create({
    data: {
      churchId: session.churchId,
      personId: person.id,
      invitedById,
      firstName,
      lastName: lastName || "",
      phone,
      email,
      photoUrl,
      purpose: String(formData.get("purpose") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      visitDate: visitDateStr ? new Date(visitDateStr) : new Date(),
    },
  });

  const { audit } = await import("@/lib/audit");
  await audit(session, "create", "visitor", `Added visitor ${firstName} ${lastName}`.trim(), v.id);
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/app/visitors");
  revalidatePath("/app/people");
}

export async function updateVisitor(formData: FormData) {
  const { requireSession, assertCanWrite } = await import("@/lib/auth");
  const session = await requireSession();
  assertCanWrite(session);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const visitor = await db.visitor.findFirst({ where: { id, churchId: session.churchId } });
  if (!visitor) return;

  const firstName = String(formData.get("firstName") ?? visitor.firstName).trim();
  const lastName = String(formData.get("lastName") ?? visitor.lastName).trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const photoUrl = String(formData.get("photoUrl") ?? "").trim() || null;
  const isRegular = formData.get("isRegular") === "on";
  const invitedByIdRaw = String(formData.get("invitedById") ?? "").trim() || null;
  const invitedById = invitedByIdRaw
    ? (await db.person.findFirst({ where: { id: invitedByIdRaw, churchId: session.churchId }, select: { id: true } }))?.id ?? null
    : null;

  await db.visitor.update({
    where: { id },
    data: {
      firstName,
      lastName,
      phone,
      email,
      photoUrl,
      isRegular,
      invitedById,
      purpose: String(formData.get("purpose") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });

  if (visitor.personId) {
    await db.person.update({
      where: { id: visitor.personId },
      data: { firstName, lastName, phone, email, photoUrl },
    });
  }

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/app/visitors");
  revalidatePath("/app/people");
}

export async function deleteVisitor(id: string) {
  const { requireSession, assertCanWrite } = await import("@/lib/auth");
  const session = await requireSession();
  assertCanWrite(session);

  const v = await db.visitor.findFirst({ where: { id, churchId: session.churchId }, select: { firstName: true, lastName: true, personId: true } });
  const { RecycleBin } = await import("@/lib/recycle-bin");
  await RecycleBin.captureVisitor(session, id);
  await db.visitor.deleteMany({ where: { id, churchId: session.churchId } });
  if (v?.personId) {
    await db.person.deleteMany({ where: { id: v.personId, churchId: session.churchId, status: "visitor" } });
  }

  const { audit } = await import("@/lib/audit");
  if (v) await audit(session, "delete", "visitor", `Deleted visitor ${v.firstName} ${v.lastName}`.trim(), id);
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/app/visitors");
  revalidatePath("/app/people");
}

export async function convertVisitorToMember(id: string) {
  const { requireSession, assertCanWrite } = await import("@/lib/auth");
  const session = await requireSession();
  assertCanWrite(session);

  const visitor = await db.visitor.findFirst({ where: { id, churchId: session.churchId } });
  if (!visitor) return;

  let personId = visitor.personId;

  if (personId) {
    await db.person.update({
      where: { id: personId },
      data: { status: "active" },
    });
  } else {
    const person = await db.person.create({
      data: {
        churchId: session.churchId,
        firstName: visitor.firstName,
        lastName: visitor.lastName,
        phone: visitor.phone,
        email: visitor.email,
        photoUrl: visitor.photoUrl,
        status: "active",
      },
    });
    personId = person.id;
  }

  await db.visitor.delete({ where: { id } });

  const { audit } = await import("@/lib/audit");
  await audit(session, "update", "person", `Converted visitor ${visitor.firstName} ${visitor.lastName} to a member`.trim(), personId);
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/app/visitors");
  revalidatePath("/app/people");
}

export async function toggleRegular(id: string) {
  const { requireSession, assertCanWrite } = await import("@/lib/auth");
  const session = await requireSession();
  assertCanWrite(session);

  const v = await db.visitor.findFirst({ where: { id, churchId: session.churchId }, select: { isRegular: true } });
  if (!v) return;
  await db.visitor.update({ where: { id }, data: { isRegular: !v.isRegular } });
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/app/visitors");
}

export async function recordVisitorCheckin(personId: string, churchId: string) {
  const visitor = await db.visitor.findFirst({ where: { personId, churchId } });
  if (!visitor) return;
  const count = visitor.visitCount + 1;
  await db.visitor.update({
    where: { id: visitor.id },
    data: {
      visitCount: count,
      lastVisit: new Date(),
      isRegular: count >= 3 ? true : visitor.isRegular,
    },
  });
}
