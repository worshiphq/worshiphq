export type PlanId = "free" | "starter" | "pro" | "max";

export const PLAN_IDS: PlanId[] = ["free", "starter", "pro", "max"];

const PLAN_RANK: Record<PlanId, number> = { free: 0, starter: 1, pro: 2, max: 3 };

/** "Up to 250 members" or "Unlimited members", from a member limit (negative or infinite = unlimited). */
export function membersText(limit: number): string {
  return !Number.isFinite(limit) || limit < 0 ? "Unlimited members" : `Up to ${limit.toLocaleString("en-US")} members`;
}

/**
 * Keep member counts written inside plan wording in step with the real limit, so changing the limit changes what
 * churches read. "Up to 250 members" becomes the new number, and "unlimited members" becomes a number if the plan now has one.
 * Wording without a member count is left alone.
 */
export function syncMemberText(text: string, limit: number): string {
  const unlimited = !Number.isFinite(limit) || limit < 0;
  const n = unlimited ? "" : limit.toLocaleString("en-US");
  return text
    .replace(/\bUp to [\d,]+ members\b/g, unlimited ? "Unlimited members" : `Up to ${n} members`)
    .replace(/\b(U)nlimited members\b/gi, (_, u: string) => (unlimited ? `${u}nlimited members` : `${u === "U" ? "Up" : "up"} to ${n} members`));
}

/** A new church on the Free plan can use Communications (SMS) for its first month, with this many free credits. */
export const COMMS_TRIAL_DAYS = 30;
export const COMMS_TRIAL_CREDITS = 60;
/** Churches that signed up before this day get their free month from this day, so nobody misses out. */
export const COMMS_TRIAL_LAUNCH = new Date("2026-10-26T00:00:00Z");

/** Is this church still inside its free month of Communications? Only the Free plan has a trial: paid plans include it already. */
export function commsTrial(createdAt: Date | string, now: Date = new Date()): { active: boolean; endsAt: Date; daysLeft: number } {
  const start = Math.max(new Date(createdAt).getTime(), COMMS_TRIAL_LAUNCH.getTime());
  const endsAt = new Date(start + COMMS_TRIAL_DAYS * 86_400_000);
  const msLeft = endsAt.getTime() - now.getTime();
  return { active: msLeft > 0, endsAt, daysLeft: Math.max(0, Math.ceil(msLeft / 86_400_000)) };
}

export interface PlanLimits {
  members: number;
  teamUsers: number;
  features: string[];
}

/** The resolved plan table. Defaults below; the SuperAdmin plan editor can
 *  override it in the database and the server passes the result down. */
export type PlanTable = Record<PlanId, PlanLimits>;

// ── Feature ladder - each tier inherits the ones below it. ──
// Rebalanced so every step is a clear jump, and Max is a big leap over Pro
// (intelligence + full finance + integration), not just accounting.

/** Core - every plan, always on. The essentials a church needs to start. */
const FREE_FEATURES = [
  "dashboard", "people", "attendance", "events", "giving", "reports",
  "directory", "calendar", "birthdays", "departments", "leaders", "notices",
  "groups", "households", "visitors", "prayer-requests", "children-forms", "teens-forms",
];

// The ladder below matches the plans as set in SuperAdmin on 28 Oct 2026. SuperAdmin (PlatformConfig.planDefs) is what
// actually applies; these are the defaults for a fresh database and the tier each NEW feature lands on.

/** Starter adds - reach your people: texts, receipts, follow-ups, IDs and forms. */
const STARTER_ADDS = [
  "sms", "reminders", "member-ids", "qr-codes",
  "form-builder", "import-export", "auto-receipts", "follow-ups",
  "data-migration", "baptisms",
];

/** Pro adds - run your ministries: teams, giving campaigns, content, welfare, facilities, the church's accounts,
 *  and the USB fingerprint scanner (`fingerprint`; the scanner is a separate hardware purchase). */
const PRO_ADDS = [
  "custom-roles", "harvest", "pledges", "recurring-giving",
  "volunteers", "rosters", "volunteer-scheduling", "bookings",
  "sermons", "devotionals", "testimonies", "welfare",
  "accounting", "expenses", "automations", "engagement-scoring", "fingerprint",
];

/** Max adds - run the whole church: wall-mounted face / palm / fingerprint terminals (`biometric-devices`),
 *  private counselling, budgets, funds and assets, the audit log, and branches. */
const MAX_ADDS = [
  "biometric-devices", "counseling", "budgets", "fund-accounting", "assets", "audit-log",
  "auto-inactive", "linked-churches", "advanced-reports", "api-access",
];

const STARTER_FEATURES = [...FREE_FEATURES, ...STARTER_ADDS];
const PRO_FEATURES = [...STARTER_FEATURES, ...PRO_ADDS];
const MAX_FEATURES = [...PRO_FEATURES, ...MAX_ADDS];

/** Feature keys grouped by the tier they unlock at - used by the plan editor
 *  matrix so it reads as a clean staircase, and re-usable elsewhere. */
export const FEATURE_TIERS = {
  core: FREE_FEATURES,
  starter: STARTER_ADDS,
  pro: PRO_ADDS,
  max: MAX_ADDS,
} as const;

export const DEFAULT_PLAN_TABLE: PlanTable = {
  free:    { members: 40,       teamUsers: 2,        features: FREE_FEATURES },
  starter: { members: 150,      teamUsers: 5,        features: STARTER_FEATURES },
  pro:     { members: 300,      teamUsers: 15,       features: PRO_FEATURES },
  max:     { members: Infinity, teamUsers: Infinity, features: MAX_FEATURES },
};

/** Every feature key the product knows about - drives the plan editor's checkbox grid. */
export const ALL_FEATURES: string[] = [...MAX_FEATURES];

/** Base features every plan always includes - shown as "CORE" and not toggleable,
 *  so a plan can never lose the essentials (dashboard, people, etc.). */
export const CORE_FEATURES: string[] = [...FREE_FEATURES];

/** Human labels for the plan editor. Falls back to the raw key. */
export const FEATURE_LABELS: Record<string, string> = {
  people: "People & profiles", attendance: "Attendance", events: "Events",
  giving: "Giving", dashboard: "Dashboard", reports: "Reports",
  "children-forms": "Children's forms", "teens-forms": "Teens forms",
  visitors: "Visitors", "prayer-requests": "Prayer requests", groups: "Groups",
  households: "Households / families", directory: "Directory", birthdays: "Birthdays",
  calendar: "Calendar", departments: "Departments", leaders: "Leaders", notices: "Notices",
  sms: "SMS broadcasts", "form-builder": "Form builder", "import-export": "Import & export",
  "member-ids": "Member IDs", "qr-codes": "QR codes", "custom-roles": "Custom roles",
  harvest: "Harvest", pledges: "Pledges & campaigns", "recurring-giving": "Recurring giving",
  "auto-receipts": "Automatic receipts", reminders: "Reminders", "data-migration": "Data migration",
  "follow-ups": "Follow-ups", sermons: "Sermons", devotionals: "Devotionals",
  testimonies: "Testimonies", automations: "Automations", volunteers: "Volunteers",
  rosters: "Rosters", "volunteer-scheduling": "Volunteer scheduling",
  "engagement-scoring": "Engagement scoring", "advanced-reports": "Advanced reports",
  welfare: "Welfare", counseling: "Counseling", "auto-inactive": "Auto-inactive members",
  bookings: "Facility bookings", accounting: "Accounting", budgets: "Budgets",
  expenses: "Expenses", "fund-accounting": "Fund accounting", assets: "Assets",
  "api-access": "API access", "audit-log": "Audit log",
  fingerprint: "USB fingerprint scanner check-in",
  "biometric-devices": "Check-in devices (face, palm and fingerprint terminals)",
  baptisms: "Baptisms & certificates", "linked-churches": "Linked churches (branches, partner churches, teens chapel)",
};

/**
 * Features added after plans were first saved in the editor. A saved plan that has never seen one of these follows the
 * built-in tier for it, so a new feature never silently lands on no plan at all. Add a feature here when it is added to a tier.
 */
export const FEATURES_ADDED_LATER = ["baptisms", "linked-churches", "biometric-devices"];

/** Permission section keys whose plan feature has a different name. */
const SECTION_FEATURE_MAP: Record<string, string> = {
  communications: "sms",
};

/** The plan feature a permission section needs, or null when every plan includes it. */
export function featureForSection(section: string): string | null {
  const feature = SECTION_FEATURE_MAP[section] ?? section;
  return ALL_FEATURES.includes(feature) && !CORE_FEATURES.includes(feature) ? feature : null;
}

/** Map nav item hrefs to plan feature keys. */
const ROUTE_FEATURE_MAP: Record<string, string> = {
  "/app/communications": "sms",
  "/app/reminders": "reminders",
  "/app/harvest": "harvest",
  "/app/pledges": "pledges",
  "/app/volunteers": "volunteers",
  "/app/rosters": "rosters",
  "/app/bookings": "bookings",
  "/app/welfare": "welfare",
  "/app/counseling": "counseling",
  "/app/accounting": "accounting",
  "/app/budgets": "budgets",
  "/app/expenses": "expenses",
  "/app/assets": "assets",
  "/app/audit-log": "audit-log",
  "/app/follow-ups": "follow-ups",
  "/app/devices": "biometric-devices",
  "/app/sermons": "sermons",
  "/app/devotionals": "devotionals",
  "/app/testimonies": "testimonies",
  "/app/baptisms": "baptisms",
};

export function getRouteFeature(href: string): string | null {
  return ROUTE_FEATURE_MAP[href] ?? null;
}

/* ── All lookups accept an optional table so DB-edited plans flow through.
      Callers that don't pass one keep the built-in defaults. ── */

export function getPlanLimits(plan: PlanId, table: PlanTable = DEFAULT_PLAN_TABLE): PlanLimits {
  return table[plan] ?? table.free ?? DEFAULT_PLAN_TABLE.free;
}

export function planHasFeature(
  plan: PlanId,
  feature: string,
  table: PlanTable = DEFAULT_PLAN_TABLE,
): boolean {
  return table[plan]?.features.includes(feature) ?? false;
}

export function getMinimumPlan(feature: string, table: PlanTable = DEFAULT_PLAN_TABLE): PlanId {
  for (const p of PLAN_IDS) {
    if (table[p]?.features.includes(feature)) return p;
  }
  return "max";
}

export function planRank(plan: PlanId): number {
  return PLAN_RANK[plan] ?? 0;
}

export function routeAllowedByPlan(
  plan: PlanId,
  href: string,
  table: PlanTable = DEFAULT_PLAN_TABLE,
): boolean {
  const feature = getRouteFeature(href);
  if (!feature) return true;
  return planHasFeature(plan, feature, table);
}
