"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getVisitorFormDefinition } from "@/lib/forms/registration";
import { sendChurchSms } from "@/lib/sms/credits";
import { DEFAULT_TEMPLATES } from "@/lib/automations/run";
import { templateFor, renderTemplate as renderRegistryTemplate } from "@/lib/messages/registry";

/** "Purpose of visit" select can be "Other", in which case the real value
 *  comes from the accompanying free-text field instead of the literal word. */
function resolvePurpose(formData: FormData): string | null {
  const raw = String(formData.get("purpose") ?? "").trim();
  if (raw !== "Other") return raw || null;
  const other = String(formData.get("purposeOther") ?? "").trim();
  return other || "Other";
}

/** The church's current "first visit welcome" wording - the visitor_followup
 *  automation's own override if they've customised it (Reminders page), else
 *  the built-in default. One source of truth so the instant sends (here) and
 *  the automation's delayed catch-all never disagree. */
async function visitorWelcomeTemplate(churchId: string): Promise<string> {
  const automation = await db.automation.findFirst({
    where: { churchId, trigger: "visitor_followup" },
    select: { messageTemplate: true },
  });
  return automation?.messageTemplate || DEFAULT_TEMPLATES.visitor_followup;
}

/** Sends the first-time welcome text right away and marks it sent, so the
 *  visitor_followup automation's catch-all knows to leave this visitor alone. */
async function sendVisitorWelcomeNow(opts: {
  churchId: string;
  churchName: string;
  visitorId: string;
  firstName: string;
  phone: string | null;
}) {
  if (!opts.phone) return;
  const template = await visitorWelcomeTemplate(opts.churchId);
  const message = template.replace(/\{name\}/g, opts.firstName).replace(/\{church\}/g, opts.churchName);
  const res = await sendChurchSms(opts.churchId, opts.phone, message, { note: "First visit welcome" });
  if (res.ok) {
    await db.visitor.update({ where: { id: opts.visitorId }, data: { welcomeSmsSentAt: new Date() } });
  }
}

/** Admin-triggered "good to see you again" text for a returning visitor.
 *  Never sent automatically - the church decides each time. */
export async function sendVisitorReturnMessage(id: string) {
  const { requireSession, assertCanWrite } = await import("@/lib/auth");
  const session = await requireSession();
  assertCanWrite(session);

  const visitor = await db.visitor.findFirst({ where: { id, churchId: session.churchId } });
  if (!visitor) return { ok: false as const, error: "Visitor not found." };
  if (!visitor.phone) return { ok: false as const, error: "This visitor has no phone number on file." };

  const church = await db.church.findUnique({ where: { id: session.churchId }, select: { name: true, messageTemplates: true } });
  if (!church) return { ok: false as const, error: "Church not found." };

  const template = templateFor(church.messageTemplates, "visitor_return");
  const message = renderRegistryTemplate(template, { name: visitor.firstName, church: church.name });
  const res = await sendChurchSms(session.churchId, visitor.phone, message, { note: "Good to see you again" });
  if (!res.ok) return { ok: false as const, error: res.insufficient ? "Insufficient SMS credits." : "Couldn't send that message." };
  return { ok: true as const };
}

export async function submitVisitorForm(formData: FormData) {
  const churchSlug = String(formData.get("churchSlug") ?? "").trim();
  if (!churchSlug) return;

  const church = await db.church.findUnique({
    where: { slug: churchSlug },
    select: { id: true, name: true, isDemo: true, visitorFormFields: true, smsWelcomeVisitor: true },
  });
  if (!church || church.isDemo) return;

  const fields = getVisitorFormDefinition(church.visitorFormFields);

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName || !lastName) return;

  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const purpose = resolvePurpose(formData);
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const photoRaw = String(formData.get("photoUrl") ?? "").trim() || null;
  const { storeImage } = await import("@/lib/storage");
  const photoUrl = await storeImage(photoRaw, "visitors");

  // No safe way to expose a searchable member picker on a public page, so
  // this is free text - kept as-is regardless so the name always shows on
  // their profile, and only linked to a real member (invitedById) when the
  // typed name matches exactly ONE member by first+last name, to avoid
  // crediting the wrong "John" at a church with several of them.
  const invitedByName = String(formData.get("invitedByName") ?? "").trim() || null;
  let invitedById: string | null = null;
  if (invitedByName) {
    const [first, ...rest] = invitedByName.split(/\s+/);
    const last = rest.join(" ");
    const matches = await db.person.findMany({
      where: {
        churchId: church.id,
        status: { not: "inactive" },
        firstName: { equals: first, mode: "insensitive" },
        ...(last ? { lastName: { equals: last, mode: "insensitive" } } : {}),
      },
      select: { id: true },
      take: 2,
    });
    if (matches.length === 1) invitedById = matches[0].id;
  }

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
      photoUrl,
      status: "visitor",
    },
  });

  const visitor = await db.visitor.create({
    data: {
      church: { connect: { id: church.id } },
      personId: person.id,
      invitedById,
      invitedByName,
      firstName,
      lastName,
      phone,
      email,
      photoUrl,
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

  // They filled this in themselves with nobody there to ask them - so unlike
  // the admin-side "Add visitor" form, this always sends (unless the church
  // has switched it off in SMS credits settings).
  if (church.smsWelcomeVisitor) {
    await sendVisitorWelcomeNow({ churchId: church.id, churchName: church.name, visitorId: visitor.id, firstName, phone });
  }

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
  const photoRaw = String(formData.get("photoUrl") ?? "").trim() || null;
  const { storeImage } = await import("@/lib/storage");
  const photoUrl = await storeImage(photoRaw, "visitors");
  const sendWelcome = String(formData.get("sendWelcome") ?? "") === "on";
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
      purpose: resolvePurpose(formData),
      notes: String(formData.get("notes") ?? "").trim() || null,
      visitDate: visitDateStr ? new Date(visitDateStr) : new Date(),
    },
  });

  const { audit } = await import("@/lib/audit");
  await audit(session, "create", "visitor", `Added visitor ${firstName} ${lastName}`.trim(), v.id);

  // Manual add - an admin is right there, so it's their call whether to send
  // the welcome text now (the checkbox on the Add visitor form).
  if (sendWelcome) {
    const church = await db.church.findUnique({ where: { id: session.churchId }, select: { name: true } });
    if (church) await sendVisitorWelcomeNow({ churchId: session.churchId, churchName: church.name, visitorId: v.id, firstName, phone });
  }

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
  const photoRaw = String(formData.get("photoUrl") ?? "").trim() || null;
  const { storeImage } = await import("@/lib/storage");
  const photoUrl = await storeImage(photoRaw, "visitors");
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
      purpose: resolvePurpose(formData),
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
