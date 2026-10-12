import type { DocArticle, DocSection } from "./types";
import { gettingStarted } from "./articles/getting-started";
import { people } from "./articles/people";
import { attendance } from "./articles/attendance";
import { giving } from "./articles/giving";
import { engagement } from "./articles/engagement";
import { admin } from "./articles/admin";
import { publicPages } from "./articles/public-pages";
import { billing } from "./articles/billing";

export const DOC_SECTIONS: DocSection[] = [
  { id: "getting-started", title: "Getting started", blurb: "Create your account, set up your church and find your way around." },
  { id: "people", title: "People & congregation", blurb: "Members, visitors, children, departments, zones, groups and leaders." },
  { id: "attendance", title: "Attendance & events", blurb: "Check-in, fingerprint, service times, events, calendar and bookings." },
  { id: "giving", title: "Giving & finance", blurb: "Giving, online giving, harvest, pledges, welfare and full accounting." },
  { id: "engagement", title: "Communication & care", blurb: "SMS and email, reminders, follow-ups, prayer, sermons and counselling." },
  { id: "admin", title: "Settings & administration", blurb: "Team and roles, forms, branding, backups, exports and the audit log." },
  { id: "public-pages", title: "Links you share with members", blurb: "Join, visitor, check-in, giving and prayer links, and how members use them." },
  { id: "billing", title: "Plans & billing", blurb: "Choosing a plan, paying, upgrading, downgrading and refunds." },
];

export const DOC_ARTICLES: DocArticle[] = [
  ...gettingStarted,
  ...people,
  ...attendance,
  ...giving,
  ...engagement,
  ...admin,
  ...publicPages,
  ...billing,
];

export function getArticle(slug: string) {
  return DOC_ARTICLES.find((a) => a.slug === slug) ?? null;
}

export function articlesIn(sectionId: string) {
  return DOC_ARTICLES.filter((a) => a.section === sectionId);
}

/** Previous and next article in reading order. */
export function neighbours(slug: string) {
  const i = DOC_ARTICLES.findIndex((a) => a.slug === slug);
  return { prev: i > 0 ? DOC_ARTICLES[i - 1] : null, next: i >= 0 && i < DOC_ARTICLES.length - 1 ? DOC_ARTICLES[i + 1] : null };
}
