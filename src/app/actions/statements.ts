"use server";

import { requireSession } from "@/lib/auth";
import { queryDonors, getStatement } from "@/lib/data/statements";

async function giving() {
  const session = await requireSession();
  if (!session.isDemo && !session.impersonating && session.sections && !session.sections.includes("giving")) throw new Error("Not allowed.");
  return session;
}

/** One page of this year's donors for a search. Called as the user types. */
export async function searchDonors(search: string, _filters: Record<string, never>, page: number) {
  const session = await giving();
  return queryDonors(session.churchId, new Date().getFullYear(), search, page);
}

/** The full statement for one donor, loaded when their row is opened. */
export async function loadStatement(personId: string) {
  const session = await giving();
  return getStatement(session.churchId, new Date().getFullYear(), personId);
}
