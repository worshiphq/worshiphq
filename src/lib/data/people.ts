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
  engagement: "active" | "at-risk" | "new";
  branch: string | null;
  ministries: string[];
  household: string | null;
  departments: string[]; // department names (many-to-many)
  departmentIds: string[];
  location: string | null;
  birthday: string | null;
  anniversary: string | null;
  joined: string; // ISO

  // Leadership
  leaderTitle: string | null;
  featured: boolean;

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
  positions: { id: string; departmentName: string; position: string }[];
  ageGroup: string | null;
  parentId: string | null;
  parentName: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  school: string | null;
  grade: string | null;
}

function engagementFor(status: PersonStatus): PersonRow["engagement"] {
  if (status === "visitor") return "new";
  if (status === "inactive") return "at-risk";
  return "active";
}

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function getPeople(churchId: string, ageFilter?: "adults" | "children"): Promise<PersonRow[]> {
  const ageWhere = ageFilter === "adults"
    ? { OR: [{ ageGroup: null }, { ageGroup: "adult" }] }
    : ageFilter === "children"
      ? { ageGroup: { in: ["child", "teen"] } }
      : {};

  const people = await db.person.findMany({
    where: { churchId, ...ageWhere },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    include: {
      branch: { select: { name: true } },
      groups: { select: { name: true } },
      household: { select: { name: true } },
      departments: { select: { id: true, name: true } },
      positions: { select: { id: true, position: true, department: { select: { name: true } } } },
      parent: { select: { firstName: true, lastName: true } },
      _count: { select: { biometrics: true } },
    },
  });
  return people.map((p) => ({
    id: p.id,
    memberId: p.memberId,
    firstName: p.firstName,
    lastName: p.lastName,
    otherNames: p.otherNames,
    fullName: [p.title, p.firstName, p.otherNames, p.lastName].filter(Boolean).join(" "),
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

    leaderTitle: p.leaderTitle,
    featured: p.featured,
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
    positions: p.positions.map((pos) => ({ id: pos.id, departmentName: pos.department.name, position: pos.position })),
    ageGroup: p.ageGroup,
    parentId: p.parentId,
    parentName: p.parent ? `${p.parent.firstName} ${p.parent.lastName}` : null,
    guardianName: p.guardianName,
    guardianPhone: p.guardianPhone,
    school: p.school,
    grade: p.grade,
  }));
}

const ADULT_FILTER = { OR: [{ ageGroup: null }, { ageGroup: "adult" }] };

export async function getPeopleStats(churchId: string) {
  const [total, active, visitors, departments] = await Promise.all([
    db.person.count({ where: { churchId, ...ADULT_FILTER } }),
    db.person.count({ where: { churchId, status: "active", ...ADULT_FILTER } }),
    db.person.count({ where: { churchId, status: "visitor", ...ADULT_FILTER } }),
    db.department.count({ where: { churchId } }),
  ]);
  return { total, active, visitors, departments };
}

export async function getChildrenStats(churchId: string) {
  const [total, children, teens] = await Promise.all([
    db.person.count({ where: { churchId, ageGroup: { in: ["child", "teen"] } } }),
    db.person.count({ where: { churchId, ageGroup: "child" } }),
    db.person.count({ where: { churchId, ageGroup: "teen" } }),
  ]);
  return { total, children, teens };
}

export async function getAllPeopleStats(churchId: string) {
  const [totalAll, adults, teens, children, active, visitors, departments] = await Promise.all([
    db.person.count({ where: { churchId } }),
    db.person.count({ where: { churchId, ...ADULT_FILTER } }),
    db.person.count({ where: { churchId, ageGroup: "teen" } }),
    db.person.count({ where: { churchId, ageGroup: "child" } }),
    db.person.count({ where: { churchId, status: "active", ...ADULT_FILTER } }),
    db.person.count({ where: { churchId, status: "visitor", ...ADULT_FILTER } }),
    db.department.count({ where: { churchId } }),
  ]);
  return { totalAll, adults, teens, children, active, visitors, departments };
}
