import "server-only";
import { db } from "@/lib/db";
import type { Prisma, PersonStatus } from "@prisma/client";

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
  /** Groups the person belongs to. */
  groupIds: string[];
  /** Zone / fellowship / etc. option ids (see member categories). */
  categoryOptionIds: string[];
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
  weddingDate: string | null;
  householdId: string | null;
  householdRole: string | null;
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
  /** Has checked in on one of the church's face / palm / fingerprint devices. */
  deviceCheckin: boolean;
  positions: { id: string; departmentName: string; position: string }[];
  ageGroup: string | null;
  parentId: string | null;
  parentName: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  school: string | null;
  grade: string | null;
}

/** What the People list, its search and its filters read. Everything else is loaded with getPersonFull when a profile is opened. */
export type PersonListRow = Pick<PersonRow,
  "id" | "memberId" | "firstName" | "lastName" | "fullName" | "email" | "phone" | "photoUrl" | "status" | "engagement" |
  "ministries" | "departments" | "groupIds" | "categoryOptionIds" | "joined" | "leaderTitle" | "gender" | "dateOfBirth" |
  "positions" | "ageGroup" | "parentName" | "guardianName" | "school" | "grade">;

function engagementFor(status: PersonStatus): PersonRow["engagement"] {
  if (status === "visitor") return "new";
  if (status === "inactive") return "at-risk";
  return "active";
}

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Who has checked in on a face / palm / fingerprint device: from their attendance (kept for good) and the
 * devices' recent scan log (matched by the number at the end of the member ID).
 */
async function deviceCheckinIds(churchId: string, people: { id: string; memberId: string | null }[]): Promise<Set<string>> {
  const hasDevice = await db.biometricDevice.count({ where: { churchId } });
  if (!hasDevice) return new Set();
  const [records, pins] = await Promise.all([
    db.attendanceRecord.findMany({ where: { churchId, verifiedBy: { startsWith: "device-" } }, select: { personId: true }, distinct: ["personId"] }),
    db.biometricDeviceEvent.findMany({ where: { churchId, result: { in: ["checked_in", "already_in"] } }, select: { pin: true }, distinct: ["pin"] }),
  ]);
  const ids = new Set(records.map((r) => r.personId).filter((x): x is string => !!x));
  const pinSet = new Set(pins.map((p) => String(Number(p.pin))));
  for (const p of people) {
    const m = /(\d+)$/.exec(p.memberId ?? "");
    if (m && pinSet.has(String(Number(m[1])))) ids.add(p.id);
  }
  return ids;
}

const FULL_INCLUDE = {
  branch: { select: { name: true } },
  groups: { select: { id: true, name: true } },
  household: { select: { name: true } },
  departments: { select: { id: true, name: true } },
  categoryOptions: { select: { id: true } },
  positions: { select: { id: true, position: true, department: { select: { name: true } } } },
  parent: { select: { firstName: true, lastName: true } },
  _count: { select: { biometrics: true } },
} as const;

/**
 * Everyone, with every field. Used where each row is opened in full (the children list, exports).
 */
export async function getPeople(churchId: string, ageFilter?: "adults" | "children"): Promise<PersonRow[]> {
  const ageWhere = ageFilter === "adults"
    ? { OR: [{ ageGroup: null }, { ageGroup: "adult" }] }
    : ageFilter === "children"
      ? { ageGroup: { in: ["child", "teen"] } }
      : {};

  const people = await db.person.findMany({
    where: { churchId, ...ageWhere },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    include: FULL_INCLUDE,
  });
  const onDevice = await deviceCheckinIds(churchId, people);
  return people.map((p) => fullRow(p, onDevice));
}

/** One person with every field, for when their profile or edit form is opened. Null if they are not in this church. */
export async function getPersonFull(churchId: string, id: string): Promise<PersonRow | null> {
  const p = await db.person.findFirst({ where: { id, churchId }, include: FULL_INCLUDE });
  if (!p) return null;
  return fullRow(p, await deviceCheckinIds(churchId, [p]));
}

/**
 * The People list: only what a row, the search box and the filters need. The other ~40 fields (addresses, emergency
 * contacts, custom answers...) are only used when someone opens a profile, which loads them with getPersonFull. For a
 * big church that is most of the page's size and most of the work to build it.
 */
const SLIM_SELECT = {
  id: true, memberId: true, firstName: true, lastName: true, otherNames: true, title: true, email: true, phone: true,
  photoUrl: true, status: true, joinedAt: true, leaderTitle: true, gender: true, dateOfBirth: true, ageGroup: true,
  guardianName: true, school: true, grade: true,
  groups: { select: { id: true, name: true } },
  departments: { select: { name: true } },
  categoryOptions: { select: { id: true } },
  positions: { select: { id: true, position: true, department: { select: { name: true } } } },
  parent: { select: { firstName: true, lastName: true } },
} satisfies Prisma.PersonSelect;

type SlimPerson = Prisma.PersonGetPayload<{ select: typeof SLIM_SELECT }>;

function listRow(p: SlimPerson): PersonListRow {
  return {
    id: p.id,
    memberId: p.memberId,
    firstName: p.firstName,
    lastName: p.lastName,
    fullName: [p.title, p.firstName, p.otherNames, p.lastName].filter(Boolean).join(" "),
    email: p.email,
    phone: p.phone,
    photoUrl: p.photoUrl,
    status: p.status,
    engagement: engagementFor(p.status),
    ministries: p.groups.map((g) => g.name),
    departments: p.departments.map((d) => d.name),
    groupIds: p.groups.map((g) => g.id),
    categoryOptionIds: p.categoryOptions.map((o) => o.id),
    joined: p.joinedAt.toISOString(),
    leaderTitle: p.leaderTitle,
    gender: p.gender,
    dateOfBirth: isoDate(p.dateOfBirth),
    positions: p.positions.map((pos) => ({ id: pos.id, departmentName: pos.department.name, position: pos.position })),
    ageGroup: p.ageGroup,
    parentName: p.parent ? `${p.parent.firstName} ${p.parent.lastName}` : null,
    guardianName: p.guardianName,
    school: p.school,
    grade: p.grade,
  };
}

export const PEOPLE_PAGE_SIZE = 25;

/** What the People screen asks for: a search, the filters, a sort and a page. All of it is answered by the database. */
export interface PeopleQuery {
  tab?: "adult" | "teen" | "child" | "kids";
  q?: string;
  /** "all" or a status. Adults tab only. */
  status?: string;
  /** A department NAME. Adults tab only. */
  department?: string;
  groupId?: string;
  engagement?: string;
  categoryOptionId?: string;
  /** Only people whose age falls in this range. Adults tab only. */
  youth?: { min: number; max: number } | null;
  sort?: "name-az" | "name-za" | "newest" | "oldest";
  page?: number;
}

const digitsOf = (s: string) => s.replace(/\D/g, "");
/** Same as phoneKey in lib/search: digits only, without the country code or leading zero. */
function phoneKeyOf(input: string): string {
  let d = digitsOf(input);
  if (d.startsWith("233") && d.length > 9) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

/** Ids of people in the church whose phone number contains these digits, however the number was written. */
async function idsByPhone(churchId: string, key: string): Promise<string[]> {
  const like = "%" + key + "%";
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Person"
    WHERE "churchId" = ${churchId}
      AND (regexp_replace(COALESCE("phone", ''), '\\D', '', 'g') LIKE ${like}
        OR regexp_replace(COALESCE("homePhone", ''), '\\D', '', 'g') LIKE ${like})
    LIMIT 500`;
  return rows.map((r) => r.id);
}

export async function queryPeople(churchId: string, q: PeopleQuery): Promise<{ rows: PersonListRow[]; total: number; page: number; pages: number }> {
  const tab = q.tab ?? "adult";
  const and: Prisma.PersonWhereInput[] = [];
  and.push(tab === "adult" ? { OR: [{ ageGroup: null }, { ageGroup: "adult" }] } : tab === "kids" ? { ageGroup: { in: ["child", "teen"] } } : { ageGroup: tab });

  if (tab === "adult") {
    if (q.status && q.status !== "all" && ["active", "visitor", "inactive"].includes(q.status)) and.push({ status: q.status as PersonStatus });
    if (q.department) and.push({ departments: { some: { name: q.department } } });
    if (q.engagement === "new") and.push({ status: "visitor" });
    else if (q.engagement === "at-risk") and.push({ status: "inactive" });
    else if (q.engagement === "active") and.push({ status: { notIn: ["visitor", "inactive"] } });
    if (q.youth) {
      const now = new Date();
      const youngest = new Date(now.getFullYear() - q.youth.min, now.getMonth(), now.getDate());
      const oldest = new Date(now.getFullYear() - q.youth.max - 1, now.getMonth(), now.getDate() + 1);
      and.push({ dateOfBirth: { gte: oldest, lte: youngest } });
    }
  }
  if (q.groupId) and.push({ groups: { some: { id: q.groupId } } });
  if (q.categoryOptionId) and.push({ categoryOptions: { some: { id: q.categoryOptionId } } });

  // Every word typed must match something, in any order (like the old in-browser search).
  const words = (q.q ?? "").trim().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 6);
  for (const w of words) {
    const has = { contains: w, mode: "insensitive" as const };
    const or: Prisma.PersonWhereInput[] = [
      { firstName: has }, { lastName: has }, { otherNames: has }, { title: has }, { email: has }, { memberId: has },
      { school: has }, { guardianName: has },
      { departments: { some: { name: has } } }, { groups: { some: { name: has } } },
      { parent: { is: { OR: [{ firstName: has }, { lastName: has }] } } },
    ];
    const key = /^[+\d][\d\s\-()]*$/.test(w) ? phoneKeyOf(w) : "";
    if (key.length >= 3) {
      const ids = await idsByPhone(churchId, key);
      if (ids.length) or.push({ id: { in: ids } });
    }
    and.push({ OR: or });
  }

  const where: Prisma.PersonWhereInput = { churchId, AND: and };
  const orderBy: Prisma.PersonOrderByWithRelationInput[] =
    q.sort === "name-za" ? [{ firstName: "desc" }, { lastName: "desc" }, { id: "asc" }]
      : q.sort === "newest" ? [{ joinedAt: "desc" }, { id: "asc" }]
        : q.sort === "oldest" ? [{ joinedAt: "asc" }, { id: "asc" }]
          : [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }];

  const total = await db.person.count({ where });
  const pages = Math.max(1, Math.ceil(total / PEOPLE_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(q.page ?? 1)), pages);
  const people = await db.person.findMany({ where, orderBy, skip: (page - 1) * PEOPLE_PAGE_SIZE, take: PEOPLE_PAGE_SIZE, select: SLIM_SELECT });
  return { rows: people.map(listRow), total, page, pages };
}

type FullPerson = Prisma.PersonGetPayload<{ include: typeof FULL_INCLUDE }>;

function fullRow(p: FullPerson, onDevice: Set<string>): PersonRow {
  return {
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
    groupIds: p.groups.map((g) => g.id),
    categoryOptionIds: p.categoryOptions.map((o) => o.id),
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
    weddingDate: isoDate(p.weddingDate),
    householdId: p.householdId,
    householdRole: p.householdRole,
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
    deviceCheckin: onDevice.has(p.id),
    positions: p.positions.map((pos) => ({ id: pos.id, departmentName: pos.department.name, position: pos.position })),
    ageGroup: p.ageGroup,
    parentId: p.parentId,
    parentName: p.parent ? `${p.parent.firstName} ${p.parent.lastName}` : null,
    guardianName: p.guardianName,
    guardianPhone: p.guardianPhone,
    school: p.school,
    grade: p.grade,
  };
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
  const [totalAll, adults, teens, children, active, visitors, departments, visitorRecords] = await Promise.all([
    db.person.count({ where: { churchId } }),
    db.person.count({ where: { churchId, ...ADULT_FILTER } }),
    db.person.count({ where: { churchId, ageGroup: "teen" } }),
    db.person.count({ where: { churchId, ageGroup: "child" } }),
    db.person.count({ where: { churchId, status: "active", ...ADULT_FILTER } }),
    db.person.count({ where: { churchId, status: "visitor", ...ADULT_FILTER } }),
    db.department.count({ where: { churchId } }),
    // The real visitor list, whatever door they came through - the Visitors tab counts these, not
    // the member rows flagged "visitor".
    db.visitor.count({ where: { churchId } }),
  ]);
  return { totalAll, adults, teens, children, active, visitors, departments, visitorRecords };
}
