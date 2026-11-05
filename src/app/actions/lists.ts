"use server";

import { requireModule } from "@/lib/auth";
import { queryVisitors } from "@/lib/data/visitors";
import { queryPeople } from "@/lib/data/people";
import { queryDirectory } from "@/lib/data/directory";
import { queryFollowUps, type FollowUpFilters } from "@/lib/data/follow-ups-list";
import { queryNotices, queryTestimonies, queryPrayer, prayerActiveIds, querySermons, queryDevotionals, queryAudit, type AuditFilters, type PrayerFilters, type SermonFilters, type DevotionalFilters } from "@/lib/data/lists-a";

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

export async function searchNotices(search: string, _f: Record<string, never>, page: number) {
  const session = await requireModule("notices");
  return queryNotices(session.churchId, search, page);
}

export async function searchTestimonies(search: string, f: { category: string }, page: number) {
  const session = await requireModule("testimonies");
  return queryTestimonies(session.churchId, search, f.category, page);
}

export async function searchPrayer(search: string, f: PrayerFilters, page: number) {
  const session = await requireModule("prayer-requests");
  return queryPrayer(session.churchId, search, f, page);
}

/** The new requests that match the current search and filters, for "mark all as prayed for". */
export async function getPrayerActiveIds(search: string, f: PrayerFilters) {
  const session = await requireModule("prayer-requests");
  return prayerActiveIds(session.churchId, search, f);
}

export async function searchSermons(search: string, f: SermonFilters, page: number) {
  const session = await requireModule("sermons");
  return querySermons(session.churchId, search, f, page);
}

export async function searchDevotionals(search: string, f: DevotionalFilters, page: number) {
  const session = await requireModule("devotionals");
  return queryDevotionals(session.churchId, search, f, page);
}

export async function searchAudit(search: string, f: AuditFilters, page: number) {
  const session = await requireModule("audit-log");
  return queryAudit(session.churchId, search, f, page);
}
