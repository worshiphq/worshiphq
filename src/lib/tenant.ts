import "server-only";
import { db } from "@/lib/db";

type Owned = "person" | "visitor" | "campaign" | "harvest" | "budget" | "volunteerRoster" | "churchAccount" | "customRole" | "group";

/**
 * The id back if that record belongs to this church, otherwise null. Use it on every id that arrives
 * from a form before storing or connecting it, so one church can never point its records at another's.
 */
export async function ownedId(model: Owned, id: string | null | undefined, churchId: string): Promise<string | null> {
  if (!id) return null;
  const delegate = (db as unknown as Record<Owned, { findFirst: (a: unknown) => Promise<{ id: string } | null> }>)[model];
  const row = await delegate.findFirst({ where: { id, churchId }, select: { id: true } });
  return row?.id ?? null;
}
