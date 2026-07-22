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

  const visitor = await db.visitor.create({
    data: {
      church: { connect: { id: church.id } },
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

/** Admin-side manual visitor entry — for when people signed a paper sheet
 *  in person rather than using the share link. */
export async function addVisitor(formData: FormData) {
  const { requireSession, assertCanWrite } = await import("@/lib/auth");
  const session = await requireSession();
  assertCanWrite(session);

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName) return;

  const visitDateStr = String(formData.get("visitDate") ?? "").trim();

  await db.visitor.create({
    data: {
      churchId: session.churchId,
      firstName,
      lastName,
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      purpose: String(formData.get("purpose") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      visitDate: visitDateStr ? new Date(visitDateStr) : new Date(),
    },
  });

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/app/visitors");
}

export async function updateVisitor(formData: FormData) {
  const { requireSession, assertCanWrite } = await import("@/lib/auth");
  const session = await requireSession();
  assertCanWrite(session);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const visitor = await db.visitor.findFirst({ where: { id, churchId: session.churchId } });
  if (!visitor) return;

  await db.visitor.update({
    where: { id },
    data: {
      firstName: String(formData.get("firstName") ?? visitor.firstName).trim(),
      lastName: String(formData.get("lastName") ?? visitor.lastName).trim(),
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      purpose: String(formData.get("purpose") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/app/visitors");
}

export async function deleteVisitor(id: string) {
  const { requireSession, assertCanWrite } = await import("@/lib/auth");
  const session = await requireSession();
  assertCanWrite(session);

  await db.visitor.deleteMany({ where: { id, churchId: session.churchId } });

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/app/visitors");
}

export async function convertVisitorToMember(id: string) {
  const { requireSession, assertCanWrite } = await import("@/lib/auth");
  const session = await requireSession();
  assertCanWrite(session);

  const visitor = await db.visitor.findFirst({ where: { id, churchId: session.churchId } });
  if (!visitor) return;

  await db.person.create({
    data: {
      churchId: session.churchId,
      firstName: visitor.firstName,
      lastName: visitor.lastName,
      phone: visitor.phone,
      email: visitor.email,
      status: "active",
    },
  });

  await db.visitor.delete({ where: { id } });

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/app/visitors");
  revalidatePath("/app/people");
}
