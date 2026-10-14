"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";

export type FamilyRole = "head" | "spouse" | "child" | "other";
const ROLES: FamilyRole[] = ["head", "spouse", "child", "other"];

export type FamilyMember = { id: string; name: string; role: FamilyRole; phone: string | null };
export type Family = {
  id: string;
  name: string;
  kind: "family" | "couple";
  /** YYYY-MM-DD, or null when no wedding date is recorded. */
  weddingDate: string | null;
  members: FamilyMember[];
};
type Result = { ok: true } | { ok: false; error: string };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => d.toISOString().slice(0, 10);

function refresh() {
  for (const p of ["/app/people", "/app/birthdays", "/app/directory", "/app/reminders"]) revalidatePath(p);
}

async function requirePeopleWriter() {
  const session = await requireSession();
  assertCanWrite(session, "people");
  if (session.isDemo) throw new Error("Read-only demo.");
  return session;
}

/** Couples celebrate together: put the wedding date on both partners (the heads), so each gets the anniversary wish. */
async function syncWedding(churchId: string, householdId: string, weddingDate: Date | null) {
  await db.person.updateMany({
    where: { churchId, householdId, householdRole: { in: ["head", "spouse"] } },
    data: { weddingDate, anniversary: weddingDate ? `${pad(weddingDate.getUTCMonth() + 1)}-${pad(weddingDate.getUTCDate())}` : null },
  });
}

/** The family a person belongs to, with everyone in it. */
export async function getFamilyOf(personId: string): Promise<Family | null> {
  const session = await requireSession();
  const me = await db.person.findFirst({ where: { id: personId, churchId: session.churchId }, select: { householdId: true } });
  if (!me?.householdId) return null;
  const h = await db.household.findFirst({
    where: { id: me.householdId, churchId: session.churchId },
    select: {
      id: true, name: true, kind: true,
      members: { select: { id: true, firstName: true, lastName: true, phone: true, householdRole: true, weddingDate: true }, orderBy: { firstName: "asc" } },
    },
  });
  if (!h) return null;
  const wedding = h.members.find((m) => (m.householdRole === "head" || m.householdRole === "spouse") && m.weddingDate)?.weddingDate ?? null;
  return {
    id: h.id,
    name: h.name,
    kind: h.kind === "couple" ? "couple" : "family",
    weddingDate: wedding ? iso(wedding) : null,
    members: h.members.map((m) => ({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`.trim(),
      phone: m.phone,
      role: (ROLES as string[]).includes(m.householdRole ?? "") ? (m.householdRole as FamilyRole) : "other",
    })),
  };
}

/** Start a family or couple with this person in it. */
export async function createFamily(input: { personId: string; name: string; kind: "family" | "couple"; weddingDate: string | null }): Promise<Result> {
  const session = await requirePeopleWriter();
  const person = await db.person.findFirst({ where: { id: input.personId, churchId: session.churchId }, select: { id: true, householdId: true } });
  if (!person) return { ok: false, error: "Member not found." };
  if (person.householdId) return { ok: false, error: "This member is already in a family." };
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) return { ok: false, error: "Give the family a name, for example the Mensah family." };
  const kind = input.kind === "couple" ? "couple" : "family";
  const h = await db.household.create({ data: { churchId: session.churchId, name, kind } });
  await db.person.update({ where: { id: person.id }, data: { householdId: h.id, householdRole: "head" } });
  const date = parseDate(input.weddingDate);
  if (date) await syncWedding(session.churchId, h.id, date);
  await audit(session, "create", "household", `Created ${kind} "${name}"`, h.id);
  refresh();
  return { ok: true };
}

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

/** Rename, change between family and couple, and set or clear the wedding date. */
export async function updateFamily(input: { householdId: string; name: string; kind: "family" | "couple"; weddingDate: string | null }): Promise<Result> {
  const session = await requirePeopleWriter();
  const h = await db.household.findFirst({ where: { id: input.householdId, churchId: session.churchId }, select: { id: true } });
  if (!h) return { ok: false, error: "Family not found." };
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) return { ok: false, error: "The family needs a name." };
  await db.household.update({ where: { id: h.id }, data: { name, kind: input.kind === "couple" ? "couple" : "family" } });
  await syncWedding(session.churchId, h.id, parseDate(input.weddingDate));
  await audit(session, "update", "household", `Updated "${name}"`, h.id);
  refresh();
  return { ok: true };
}

/** Add a member to a family with a role. Partners pick up the family's wedding date. */
export async function addFamilyMember(input: { householdId: string; personId: string; role: FamilyRole }): Promise<Result> {
  const session = await requirePeopleWriter();
  const [h, p] = await Promise.all([
    db.household.findFirst({ where: { id: input.householdId, churchId: session.churchId }, select: { id: true, name: true } }),
    db.person.findFirst({ where: { id: input.personId, churchId: session.churchId }, select: { id: true, householdId: true, firstName: true } }),
  ]);
  if (!h || !p) return { ok: false, error: "Not found." };
  if (p.householdId && p.householdId !== h.id) return { ok: false, error: `${p.firstName} is already in another family. Remove them from it first.` };
  if (p.householdId === h.id) return setFamilyRole({ personId: p.id, role: input.role });
  const role = ROLES.includes(input.role) ? input.role : "other";
  await db.person.update({ where: { id: p.id }, data: { householdId: h.id, householdRole: role } });
  const partner = await db.person.findFirst({
    where: { churchId: session.churchId, householdId: h.id, householdRole: { in: ["head", "spouse"] }, weddingDate: { not: null }, NOT: { id: p.id } },
    select: { weddingDate: true },
  });
  if (partner?.weddingDate) await syncWedding(session.churchId, h.id, partner.weddingDate);
  await audit(session, "update", "household", `Added ${p.firstName} to "${h.name}"`, h.id);
  refresh();
  return { ok: true };
}

export async function setFamilyRole(input: { personId: string; role: FamilyRole }): Promise<Result> {
  const session = await requirePeopleWriter();
  const p = await db.person.findFirst({ where: { id: input.personId, churchId: session.churchId }, select: { id: true, householdId: true } });
  if (!p?.householdId) return { ok: false, error: "Not found." };
  const role = ROLES.includes(input.role) ? input.role : "other";
  await db.person.update({ where: { id: p.id }, data: { householdRole: role } });
  // Someone who is no longer a partner stops carrying the wedding date; a new partner picks it up.
  if (role === "head" || role === "spouse") {
    const partner = await db.person.findFirst({
      where: { churchId: session.churchId, householdId: p.householdId, householdRole: { in: ["head", "spouse"] }, weddingDate: { not: null }, NOT: { id: p.id } },
      select: { weddingDate: true },
    });
    if (partner?.weddingDate) await syncWedding(session.churchId, p.householdId, partner.weddingDate);
  } else {
    await db.person.update({ where: { id: p.id }, data: { weddingDate: null, anniversary: null } });
  }
  refresh();
  return { ok: true };
}

/** Take someone out of their family. A family left with nobody is removed. */
export async function removeFamilyMember(personId: string): Promise<Result> {
  const session = await requirePeopleWriter();
  const p = await db.person.findFirst({ where: { id: personId, churchId: session.churchId }, select: { id: true, householdId: true, firstName: true } });
  if (!p?.householdId) return { ok: false, error: "Not found." };
  const householdId = p.householdId;
  await db.person.update({ where: { id: p.id }, data: { householdId: null, householdRole: null } });
  const left = await db.person.count({ where: { churchId: session.churchId, householdId } });
  if (left === 0) await db.household.delete({ where: { id: householdId } });
  await audit(session, "update", "household", `Removed ${p.firstName} from a family`, householdId);
  refresh();
  return { ok: true };
}

/** Find members to add to a family (by name or phone). */
export async function searchFamilyCandidates(query: string, householdId: string | null): Promise<{ id: string; name: string; phone: string | null; family: string | null }[]> {
  const session = await requireSession();
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await db.person.findMany({
    where: {
      churchId: session.churchId,
      ...(householdId ? { OR: [{ householdId: null }, { householdId: { not: householdId } }] } : {}),
      AND: [{ OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }],
    },
    select: { id: true, firstName: true, lastName: true, phone: true, household: { select: { name: true } } },
    orderBy: { firstName: "asc" },
    take: 8,
  });
  return rows.map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}`.trim(), phone: r.phone, family: r.household?.name ?? null }));
}
