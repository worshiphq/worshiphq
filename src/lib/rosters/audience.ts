import "server-only";
import { db } from "@/lib/db";

type ChurchDefault = { id: string; rosterAnnounceAudience: string; rosterAnnounceGroupId: string | null };
type SheetOverride = { announceAudience: string | null; announceGroupId: string | null };

/**
 * Who a roster sheet is announced to. A roster's own choice wins; otherwise it
 * follows the church-wide default. This is what lets an Ushering roster text the
 * ushers while a Pulpit roster texts the pulpit group, instead of every roster
 * going to the one default group.
 */
export async function rosterRecipientPhones(church: ChurchDefault, sheet: SheetOverride): Promise<string[]> {
  const audience = sheet.announceAudience ?? church.rosterAnnounceAudience;
  const groupId = sheet.announceAudience ? sheet.announceGroupId : church.rosterAnnounceGroupId;

  if (audience === "church") {
    const people = await db.person.findMany({
      where: { churchId: church.id, status: { not: "inactive" }, phone: { not: null } },
      select: { phone: true },
    });
    return people.map((p) => p.phone!).filter(Boolean);
  }
  if (!groupId) return [];
  const group = await db.group.findFirst({
    where: { id: groupId, churchId: church.id },
    select: { members: { where: { phone: { not: null } }, select: { phone: true } } },
  });
  return (group?.members ?? []).map((m) => m.phone!).filter(Boolean);
}
