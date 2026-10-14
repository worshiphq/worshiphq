import "server-only";
import { db } from "@/lib/db";
import { getFormDefinition } from "@/lib/forms/registration";

export type AgeFilter = "all" | "adult" | "teen" | "child";

export const AGE_LABELS: Record<AgeFilter, string> = {
  all: "All members",
  adult: "Adults",
  teen: "Teens",
  child: "Children",
};

export function parseAgeFilter(v: string | null | undefined): AgeFilter {
  return v === "adult" || v === "teen" || v === "child" ? v : "all";
}

const fmtDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

/**
 * The full members table: every detail collected (not just the basics), plus a
 * column for each zone/fellowship category and each custom question on the
 * registration form. Used by the Members export, the Download data page and the
 * all-data bundle, so they can never drift apart.
 */
export async function membersTable(churchId: string, age: AgeFilter = "all") {
  const where = {
    churchId,
    ...(age === "adult" ? { OR: [{ ageGroup: null }, { ageGroup: "adult" }] } : age === "teen" || age === "child" ? { ageGroup: age } : {}),
  };
  const [people, church, categories] = await Promise.all([
    db.person.findMany({
      where,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      include: {
        departments: { select: { name: true } },
        department: { select: { name: true } },
        branch: { select: { name: true } },
        categoryOptions: { select: { categoryId: true, name: true } },
        groups: { select: { name: true } },
      },
    }),
    db.church.findUnique({ where: { id: churchId }, select: { registrationFields: true } }),
    db.memberCategory.findMany({ where: { churchId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);

  const customLabels = getFormDefinition(church?.registrationFields ?? null)
    .filter((f) => !f.system && f.id !== "department")
    .map((f) => f.label);

  const headers = [
    "Member ID", "First Name", "Last Name", "Other Names", "Age group", "Email", "Phone", "Gender", "Title",
    "Date of Birth", "Marital Status", "Occupation", "Employer", "Previous Church", "Date of Membership",
    "Place of Birth", "Nationality", "Country", "Region", "District", "Town", "Home Town",
    "National ID", "House Address", "Postal Address", "Work Phone", "Home Phone", "Special Interest",
    "Baptized", "Departments", "Groups", ...categories.map((c) => c.name), "Status",
    "Emergency Name", "Emergency Phone", "Emergency Relation", "Emergency Email", "Emergency Address",
    "Notes", "Joined",
    ...customLabels,
  ];
  const ageLabel = (a: string | null) => (a === "teen" ? "Teen" : a === "child" ? "Child" : "Adult");
  const rows = people.map((p) => {
    const cf = (p.customFields as Record<string, string> | null) ?? {};
    return [
      p.memberId, p.firstName, p.lastName, p.otherNames, ageLabel(p.ageGroup), p.email, p.phone, p.gender, p.title,
      fmtDate(p.dateOfBirth), p.maritalStatus, p.occupation, p.employer,
      p.previousChurch, fmtDate(p.dateOfMembership), p.placeOfBirth,
      p.nationality, p.country, p.region, p.district, p.town, p.homeTown, p.nationalId,
      p.houseAddress, p.postalAddress, p.workPhone, p.homePhone, p.specialInterest,
      p.baptized === true ? "Yes" : p.baptized === false ? "No" : "",
      [...new Set([...p.departments.map((d) => d.name), ...(p.department ? [p.department.name] : [])])].sort().join("; "),
      p.groups.map((g) => g.name).sort().join("; "),
      ...categories.map((c) => p.categoryOptions.filter((o) => o.categoryId === c.id).map((o) => o.name).join("; ")),
      p.status,
      p.emergencyName, p.emergencyPhone, p.emergencyRelation, p.emergencyEmail, p.emergencyAddress,
      p.notes, fmtDate(p.joinedAt),
      ...customLabels.map((l) => cf[l] ?? ""),
    ];
  });
  return { headers, rows };
}
