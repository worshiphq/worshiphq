import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Digits only, without the country code or leading zero: the same key as phoneKey in lib/search. */
export function phoneKeyOf(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("233") && d.length > 9) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

/** Ids of people in the church whose phone number contains these digits, however the number was written. */
export async function idsByPhone(churchId: string, key: string): Promise<string[]> {
  const like = "%" + key + "%";
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Person"
    WHERE "churchId" = ${churchId}
      AND (regexp_replace(COALESCE("phone", ''), '\\D', '', 'g') LIKE ${like}
        OR regexp_replace(COALESCE("homePhone", ''), '\\D', '', 'g') LIKE ${like})
    LIMIT 500`;
  return rows.map((r) => r.id);
}

/**
 * The database side of "search for a person": every word typed must match the name, member ID or email, and a number
 * typed in any format finds the phone. Returns conditions to AND into a Person query. `extra` adds more text columns
 * (a school, a guardian) for lists that show them.
 */
export async function personSearchAnd(churchId: string, q: string | undefined, extra: (keyof Prisma.PersonWhereInput)[] = []): Promise<Prisma.PersonWhereInput[]> {
  const words = (q ?? "").trim().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 6);
  const and: Prisma.PersonWhereInput[] = [];
  for (const w of words) {
    const has = { contains: w, mode: "insensitive" as const };
    const or: Prisma.PersonWhereInput[] = [
      { firstName: has }, { lastName: has }, { otherNames: has }, { title: has }, { email: has }, { memberId: has },
      ...extra.map((k) => ({ [k]: has }) as Prisma.PersonWhereInput),
    ];
    const key = /^[+\d][\d\s\-()]*$/.test(w) ? phoneKeyOf(w) : "";
    if (key.length >= 3) {
      const ids = await idsByPhone(churchId, key);
      if (ids.length) or.push({ id: { in: ids } });
    }
    and.push({ OR: or });
  }
  return and;
}
