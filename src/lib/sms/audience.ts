import "server-only";
import { db } from "@/lib/db";

/**
 * Who a church-wide text can go to. Used by devotionals today; shaped so any
 * "send to the congregation" feature can reuse it.
 *
 *   "all"        every member who is not inactive and has a phone
 *   "active"     active members only
 *   "leaders"    anyone with a leadership title
 *   "people"     exactly the people you pick (pass their ids)
 *   "dept:<id>"  a department
 *   "group:<id>" a group / ministry
 */
export type AudienceKey = string;

export async function audienceOptions(churchId: string) {
  const [departments, groups] = await Promise.all([
    db.department.findMany({ where: { churchId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.group.findMany({ where: { churchId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return [
    { value: "all", label: "Everyone in the church" },
    { value: "active", label: "Active members only" },
    { value: "leaders", label: "Church leaders" },
    { value: "people", label: "Choose specific people..." },
    ...departments.map((d) => ({ value: `dept:${d.id}`, label: `Department: ${d.name}` })),
    ...groups.map((g) => ({ value: `group:${g.id}`, label: `Group: ${g.name}` })),
  ];
}

export async function resolveAudience(churchId: string, audience: AudienceKey, personIds: string[] = []) {
  const where: Record<string, unknown> = { churchId, phone: { not: null } };
  let label = "Everyone in the church";

  if (audience === "active") {
    where.status = "active";
    label = "Active members";
  } else if (audience === "leaders") {
    where.status = { not: "inactive" };
    where.leaderTitle = { not: null };
    label = "Church leaders";
  } else if (audience === "people") {
    where.id = { in: personIds.slice(0, 2000) };
    label = `${personIds.length} chosen ${personIds.length === 1 ? "person" : "people"}`;
  } else if (audience.startsWith("dept:")) {
    const id = audience.slice(5);
    const dept = await db.department.findFirst({ where: { id, churchId }, select: { name: true } });
    where.status = { not: "inactive" };
    where.departments = { some: { id } };
    label = dept ? `${dept.name} department` : "Department";
  } else if (audience.startsWith("group:")) {
    const id = audience.slice(6);
    const group = await db.group.findFirst({ where: { id, churchId }, select: { name: true } });
    where.status = { not: "inactive" };
    where.groups = { some: { id } };
    label = group ? `${group.name} group` : "Group";
  } else {
    where.status = { not: "inactive" };
  }

  const people = await db.person.findMany({ where, select: { id: true, firstName: true, lastName: true, phone: true } });
  // One text per phone number (a family sharing a number should not be charged twice).
  const seen = new Set<string>();
  const recipients = people.filter((p) => {
    const key = (p.phone ?? "").replace(/\s+/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { label, recipients };
}
