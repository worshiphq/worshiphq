"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";

/**
 * Public self-registration: a member fills in the join form, which creates a Person
 * record in the church. No authentication required — leaders share the link.
 */
export async function selfRegister(formData: FormData) {
  const churchSlug = String(formData.get("churchSlug") ?? "").trim();
  if (!churchSlug) return;

  const church = await db.church.findUnique({
    where: { slug: churchSlug },
    select: { id: true, isDemo: true },
  });
  if (!church || church.isDemo) return;

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName || !lastName) return;

  // Resolve department by name if provided
  let departmentId: string | null = null;
  const deptName = String(formData.get("department") ?? "").trim();
  if (deptName) {
    const dept = await db.department.findUnique({
      where: { churchId_name: { churchId: church.id, name: deptName } },
    });
    if (dept) departmentId = dept.id;
  }

  // Parse date of birth
  let dateOfBirth: Date | null = null;
  const dobStr = String(formData.get("dateOfBirth") ?? "").trim();
  if (dobStr) {
    const d = new Date(dobStr);
    if (!isNaN(d.getTime())) dateOfBirth = d;
  }

  // Parse date of membership
  let dateOfMembership: Date | null = null;
  const domStr = String(formData.get("dateOfMembership") ?? "").trim();
  if (domStr) {
    const d = new Date(domStr);
    if (!isNaN(d.getTime())) dateOfMembership = d;
  }

  // Build birthday MM-DD from dateOfBirth
  let birthday: string | null = null;
  if (dateOfBirth) {
    birthday = `${String(dateOfBirth.getMonth() + 1).padStart(2, "0")}-${String(dateOfBirth.getDate()).padStart(2, "0")}`;
  }

  await db.person.create({
    data: {
      churchId: church.id,
      firstName,
      lastName,
      otherNames: String(formData.get("otherNames") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      gender: String(formData.get("gender") ?? "").trim() || null,
      title: String(formData.get("title") ?? "").trim() || null,
      dateOfBirth,
      birthday,
      occupation: String(formData.get("occupation") ?? "").trim() || null,
      employer: String(formData.get("employer") ?? "").trim() || null,
      previousChurch: String(formData.get("previousChurch") ?? "").trim() || null,
      dateOfMembership,
      placeOfBirth: String(formData.get("placeOfBirth") ?? "").trim() || null,
      nationality: String(formData.get("nationality") ?? "").trim() || "Ghanaian",
      country: String(formData.get("country") ?? "").trim() || "Ghana",
      region: String(formData.get("region") ?? "").trim() || null,
      district: String(formData.get("district") ?? "").trim() || null,
      town: String(formData.get("town") ?? "").trim() || null,
      nationalId: String(formData.get("nationalId") ?? "").trim() || null,
      houseAddress: String(formData.get("houseAddress") ?? "").trim() || null,
      homeTown: String(formData.get("homeTown") ?? "").trim() || null,
      workPhone: String(formData.get("workPhone") ?? "").trim() || null,
      postalAddress: String(formData.get("postalAddress") ?? "").trim() || null,
      homePhone: String(formData.get("homePhone") ?? "").trim() || null,
      specialInterest: String(formData.get("specialInterest") ?? "").trim() || null,
      maritalStatus: String(formData.get("maritalStatus") ?? "").trim() || null,
      baptized: formData.get("baptized") === "yes" ? true : formData.get("baptized") === "no" ? false : null,
      location: String(formData.get("town") ?? "").trim() || String(formData.get("region") ?? "").trim() || null,
      emergencyName: String(formData.get("emergencyName") ?? "").trim() || null,
      emergencyPhone: String(formData.get("emergencyPhone") ?? "").trim() || null,
      emergencyRelation: String(formData.get("emergencyRelation") ?? "").trim() || null,
      emergencyEmail: String(formData.get("emergencyEmail") ?? "").trim() || null,
      emergencyAddress: String(formData.get("emergencyAddress") ?? "").trim() || null,
      departmentId,
      status: "active",
    },
  });

  redirect(`/join/${churchSlug}/thank-you`);
}
