import "server-only";
import { db } from "@/lib/db";

type ChurchDefault = { id: string; rosterAnnounceAudience: string; rosterAnnounceGroupId: string | null };
type SheetOverride = { announceAudience: string | null; announceGroupId: string | null };

/**
 * Who a roster sheet is announced to. A roster's own choice wins; otherwise it
 * follows the church-wide default. This is what lets an Ushering roster text the
 * ushers while a Pulpit roster texts the pulpit group, instead of every roster
 * going to the one default group.
 *
 * Audiences: "group" (announceGroupId = a Group), "department" (announceGroupId =
 * a Department), or "church" (everyone active with a phone number).
 */
export async function rosterRecipientPhones(church: ChurchDefault, sheet: SheetOverride): Promise<string[]> {
  const audience = sheet.announceAudience ?? church.rosterAnnounceAudience;
  const targetId = sheet.announceAudience ? sheet.announceGroupId : church.rosterAnnounceGroupId;

  const unique = (phones: (string | null)[]) => [...new Set(phones.filter((p): p is string => !!p))];

  if (audience === "church") {
    const people = await db.person.findMany({
      where: { churchId: church.id, status: { not: "inactive" }, phone: { not: null } },
      select: { phone: true },
    });
    return unique(people.map((p) => p.phone));
  }
  if (!targetId) return [];

  if (audience === "department") {
    // A member can be linked by the many-to-many list or the older single department.
    const dept = await db.department.findFirst({ where: { id: targetId, churchId: church.id }, select: { id: true } });
    if (!dept) return [];
    const people = await db.person.findMany({
      where: {
        churchId: church.id, status: { not: "inactive" }, phone: { not: null },
        OR: [{ departmentId: dept.id }, { departments: { some: { id: dept.id } } }],
      },
      select: { phone: true },
    });
    return unique(people.map((p) => p.phone));
  }

  const group = await db.group.findFirst({
    where: { id: targetId, churchId: church.id },
    select: { members: { where: { phone: { not: null } }, select: { phone: true } } },
  });
  return unique((group?.members ?? []).map((m) => m.phone));
}
