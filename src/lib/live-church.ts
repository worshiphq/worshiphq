import type { Prisma } from "@prisma/client";

/**
 * The filter for "real" churches: not the read-only demo and not the hidden internal QA church.
 * Use it everywhere a query counts, messages, bills or reports on churches. The literal
 * `isDemo: false` must not appear anywhere else (scripts/check-live-church.mjs enforces this).
 */
export const LIVE_CHURCH = { isDemo: false, isInternal: false } satisfies Prisma.ChurchWhereInput;

/** True for churches that must never be counted, messaged or billed: the demo and internal QA churches. */
export const isHiddenChurch = (c: { isDemo?: boolean | null; isInternal?: boolean | null }) => !!(c.isDemo || c.isInternal);

/** Slugs starting with this are reserved for internal QA churches; normal signups never get one. */
export const INTERNAL_SLUG_PREFIX = "zz-qa-";

/** Page metadata that keeps an internal QA church's public pages out of search engines. */
export const hiddenChurchRobots = (c: { isInternal?: boolean | null }) =>
  c.isInternal ? { robots: { index: false, follow: false } } : {};
