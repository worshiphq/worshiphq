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

  await db.visitor.create({
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

  redirect(`/visit/${churchSlug}/thank-you`);
}
