"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getFormDefinition, isSystemColumn, DEPARTMENT_FIELD_ID } from "@/lib/forms/registration";

const DATE_FIELDS = new Set(["dateOfBirth", "dateOfMembership"]);

/**
 * Public self-registration. Reads the church's (possibly customised) form
 * definition, maps system fields to Person columns and custom fields into
 * Person.customFields. No authentication required — leaders share the link.
 */
export async function selfRegister(formData: FormData) {
  const churchSlug = String(formData.get("churchSlug") ?? "").trim();
  if (!churchSlug) return;

  const church = await db.church.findUnique({
    where: { slug: churchSlug },
    select: { id: true, isDemo: true, registrationFields: true },
  });
  if (!church || church.isDemo) return;

  const fields = getFormDefinition(church.registrationFields);

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName || !lastName) return;

  const data: Prisma.PersonUncheckedCreateInput = {
    churchId: church.id,
    firstName,
    lastName,
    nationality: "Ghanaian",
    country: "Ghana",
    status: "active",
  };
  // Untyped view for assigning dynamic system-column keys.
  const set = data as Record<string, unknown>;
  const customFields: Record<string, string> = {};

  for (const field of fields) {
    if (field.id === "firstName" || field.id === "lastName") continue;
    const raw = String(formData.get(field.id) ?? "").trim();
    if (!raw) continue;

    if (field.id === DEPARTMENT_FIELD_ID) {
      const dept = await db.department.findUnique({
        where: { churchId_name: { churchId: church.id, name: raw } },
      });
      if (dept) set.departmentId = dept.id;
      continue;
    }

    if (isSystemColumn(field.id)) {
      if (DATE_FIELDS.has(field.id)) {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) set[field.id] = d;
      } else if (field.id === "baptized") {
        set.baptized = /^(yes|true)$/i.test(raw) ? true : /^(no|false)$/i.test(raw) ? false : null;
      } else {
        set[field.id] = raw;
      }
    } else {
      // custom field → store under its label
      customFields[field.label] = raw;
    }
  }

  // Derived: birthday MM-DD + a coarse location for the people list.
  if (set.dateOfBirth instanceof Date) {
    const d = set.dateOfBirth as Date;
    set.birthday = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  set.location = (set.town as string) || (set.region as string) || null;
  if (Object.keys(customFields).length > 0) set.customFields = customFields;

  await db.person.create({ data });

  redirect(`/join/${churchSlug}/thank-you`);
}
