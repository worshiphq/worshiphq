"use server";

import { requireModule } from "@/lib/auth";
import { queryVisitors } from "@/lib/data/visitors";
import { queryPeople } from "@/lib/data/people";
import { queryDirectory } from "@/lib/data/directory";
import { queryFollowUps, type FollowUpFilters } from "@/lib/data/follow-ups-list";

/**
 * Server-side search for the paged lists. Each one returns one page of rows for a search and filters, answered by the
 * database, and is called by `useServerList` as the user types (after a short pause) or changes a filter.
 */

export async function searchVisitors(search: string, filters: { regular: boolean }, page: number) {
  const session = await requireModule("visitors");
  return queryVisitors(session.churchId, search, !!filters.regular, page);
}

export async function searchChildren(search: string, filters: { segment: "all" | "child" | "teen" }, page: number) {
  const session = await requireModule("people");
  const tab = filters.segment === "child" ? "child" : filters.segment === "teen" ? "teen" : "kids";
  return queryPeople(session.churchId, { tab, q: search, page });
}

export async function searchDirectory(search: string, filters: { department: string; groupId: string }, page: number) {
  const session = await requireModule("directory");
  return queryDirectory(session.churchId, search, filters.department, filters.groupId, page);
}

export async function searchFollowUps(search: string, filters: FollowUpFilters, page: number) {
  const session = await requireModule("follow-ups");
  return queryFollowUps(session.churchId, session.userId, search, filters, page);
}
