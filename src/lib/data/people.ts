import "server-only";
import { db } from "@/lib/db";
import type { PersonStatus } from "@prisma/client";

export interface PersonRow {
  id: string;
  memberId: string | null;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  status: PersonStatus;
  engagement: "thriving" | "steady" | "at-risk" | "new";
  branch: string | null;
  ministries: string[];
  household: string | null;
  departments: string[]; // department names (many-to-many)
  departmentIds: string[];
  location: string | null;
  birthday: string | null;
  anniversary: string | null;
  joined: string; // ISO

  // Rich fields (used for edit prefill)
  gender: string | null;
  title: string | null;
  dateOfBirth: string | null; // ISO (date input)
  dateOfMembership: string | null;
  occupation: string | null;
  employer: string | null;
  previousChurch: string | null;
  maritalStatus: string | null;
  region: string | null;
  district: string | null;
  town: string | null;
  homeTown: string | null;
  placeOfBirth: string | null;
  nationality: string | null;
  country: string | null;
  nationalId: string | null;
  houseAddress: string | null;
  postalAddress: string | null;
  workPhone: string | null;
  homePhone: string | null;
  specialInterest: string | null;
  baptized: boolean | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelation: string | null;
  emergencyEmail: string | null;
  emergencyAddress: string | null;
  customFields: Record<string, string>;
  biometricRegistered: boolean;
}

function engagementFor(status: PersonStatus): PersonRow["engagement"] {
  if (status === "visitor") return "new";
  if (status === "inactive") return "at-risk";
  return "steady";
}

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function getPeople(churchId: string): Promise<PersonRow[]> {
  const people = await db.person.findMany({
    where: { churchId },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    include: {
      branch: { select: { name: true } },
      groups: { select: { name: true } },
      household: { select: { name: true } },
      departments: { select: { id: true, name: true } },
      _count: { select: { biometrics: true } },
    },
  });
  return people.map((p) => ({
    id: p.id,
    memberId: p.memberId,
    firstName: p.firstName,
    lastName: p.lastName,
    otherNames: p.otherNames,
    fullName: `${p.firstName} ${p.lastName}`,
    email: p.email,
    phone: p.phone,
    photoUrl: p.photoUrl,
    status: p.status,
    engagement: engagementFor(p.status),
    branch: p.branch?.name ?? null,
    ministries: p.groups.map((g) => g.name),
    household: p.household?.name ?? null,
    departments: p.departments.map((d) => d.name),
    departmentIds: p.departments.map((d) => d.id),
    location: p.location,
    birthday: p.birthday,
    anniversary: p.anniversary,
    joined: p.joinedAt.toISOString(),

    gender: p.gender,
    title: p.title,
    dateOfBirth: isoDate(p.dateOfBirth),
    dateOfMembership: isoDate(p.dateOfMembership),
    occupation: p.occupation,
    employer: p.employer,
    previousChurch: p.previousChurch,
    maritalStatus: p.maritalStatus,
    region: p.region,
    district: p.district,
    town: p.town,
    homeTown: p.homeTown,
    placeOfBirth: p.placeOfBirth,
    nationality: p.nationality,
    country: p.country,
    nationalId: p.nationalId,
    houseAddress: p.houseAddress,
    postalAddress: p.postalAddress,
    workPhone: p.workPhone,
    homePhone: p.homePhone,
    specialInterest: p.specialInterest,
    baptized: p.baptized,
    emergencyName: p.emergencyName,
    emergencyPhone: p.emergencyPhone,
    emergencyRelation: p.emergencyRelation,
    emergencyEmail: p.emergencyEmail,
    emergencyAddress: p.emergencyAddress,
    customFields: (p.customFields as Record<string, string> | null) ?? {},
    biometricRegistered: p._count.biometrics > 0,
  }));
}

export async function getPeopleStats(churchId: string) {
  const [total, active, visitors, departments] = await Promise.all([
    db.person.count({ where: { churchId } }),
    db.person.count({ where: { churchId, status: "active" } }),
    db.person.count({ where: { churchId, status: "visitor" } }),
    db.department.count({ where: { churchId } }),
  ]);
  return { total, active, visitors, departments };
}
