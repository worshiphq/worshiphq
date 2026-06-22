"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getFormDefinition, getChildrenFormDefinition, getTeensFormDefinition } from "@/lib/forms/registration";
import { buildPersonData } from "@/lib/forms/person-data";
import { nextMemberId, resolveDepartmentIds } from "@/lib/members/helpers";
import { sendChurchSms } from "@/lib/sms/credits";

/**
 * Public self-registration. Uses the same shared form mapper as the admin add/
 * edit member form, so all three forms capture and store identical fields.
 */
export async function selfRegister(formData: FormData) {
  const churchSlug = String(formData.get("churchSlug") ?? "").trim();
  if (!churchSlug) return;

  const church = await db.church.findUnique({
    where: { slug: churchSlug },
    select: { id: true, name: true, isDemo: true, registrationFields: true, smsWelcomeMember: true },
  });
  if (!church || church.isDemo) return;

  const fields = getFormDefinition(church.registrationFields);
  const { data, customFields, departmentNames } = buildPersonData(fields, formData);
  if (!data.firstName || !data.lastName) return;

  const deptIds = await resolveDepartmentIds(church.id, departmentNames);
  const memberId = await nextMemberId(church.id);

  await db.person.create({
    data: {
      ...(data as Prisma.PersonCreateInput),
      church: { connect: { id: church.id } },
      status: "active",
      memberId,
      nationality: (data.nationality as string) ?? "Ghanaian",
      country: (data.country as string) ?? "Ghana",
      ...(Object.keys(customFields).length ? { customFields } : {}),
      ...(deptIds.length
        ? { departments: { connect: deptIds.map((id) => ({ id })) }, department: { connect: { id: deptIds[0] } } }
        : {}),
    },
  });

  // Optional welcome SMS to the new member (billed to the church's credits).
  const phone = typeof data.phone === "string" ? data.phone : "";
  const firstName = String(data.firstName);
  if (church.smsWelcomeMember && phone) {
    await sendChurchSms(
      church.id,
      phone,
      `Welcome, ${firstName}! Thanks for registering. We're glad to have you in the family.`,
      { note: "Welcome (self-registration)" },
    );
  }

  redirect(`/join/${churchSlug}/thank-you`);
}

export async function registerChild(formData: FormData) {
  const churchSlug = String(formData.get("churchSlug") ?? "").trim();
  if (!churchSlug) return;

  const church = await db.church.findUnique({
    where: { slug: churchSlug },
    select: { id: true, name: true, isDemo: true, childrenFormFields: true },
  });
  if (!church || church.isDemo) return;

  const fields = getChildrenFormDefinition(church.childrenFormFields);
  const { data, customFields } = buildPersonData(fields, formData);
  if (!data.firstName || !data.lastName) return;

  const memberId = await nextMemberId(church.id);

  await db.person.create({
    data: {
      ...(data as Prisma.PersonCreateInput),
      church: { connect: { id: church.id } },
      status: "active",
      memberId,
      ageGroup: "child",
      ...(Object.keys(customFields).length ? { customFields } : {}),
    },
  });

  redirect(`/children/${churchSlug}/thank-you`);
}

export async function registerTeen(formData: FormData) {
  const churchSlug = String(formData.get("churchSlug") ?? "").trim();
  if (!churchSlug) return;

  const church = await db.church.findUnique({
    where: { slug: churchSlug },
    select: { id: true, name: true, isDemo: true, teensFormFields: true },
  });
  if (!church || church.isDemo) return;

  const fields = getTeensFormDefinition(church.teensFormFields);
  const { data, customFields, departmentNames } = buildPersonData(fields, formData);
  if (!data.firstName || !data.lastName) return;

  const deptIds = await resolveDepartmentIds(church.id, departmentNames);
  const memberId = await nextMemberId(church.id);

  await db.person.create({
    data: {
      ...(data as Prisma.PersonCreateInput),
      church: { connect: { id: church.id } },
      status: "active",
      memberId,
      ageGroup: "teen",
      ...(Object.keys(customFields).length ? { customFields } : {}),
      ...(deptIds.length
        ? { departments: { connect: deptIds.map((id) => ({ id })) }, department: { connect: { id: deptIds[0] } } }
        : {}),
    },
  });

  redirect(`/teens/${churchSlug}/thank-you`);
}
