export type PlanId = "free" | "starter" | "pro" | "max";

export const PLAN_IDS: PlanId[] = ["free", "starter", "pro", "max"];

const PLAN_RANK: Record<PlanId, number> = { free: 0, starter: 1, pro: 2, max: 3 };

export interface PlanLimits {
  members: number;
  teamUsers: number;
  features: string[];
}

/** The resolved plan table. Defaults below; the SuperAdmin plan editor can
 *  override it in the database and the server passes the result down. */
export type PlanTable = Record<PlanId, PlanLimits>;

// ── Feature ladder — each tier inherits the ones below it. ──
// Rebalanced so every step is a clear jump, and Max is a big leap over Pro
// (intelligence + full finance + integration), not just accounting.

/** Core — every plan, always on. The essentials a church needs to start. */
const FREE_FEATURES = [
  "dashboard", "people", "attendance", "events", "giving", "reports",
  "directory", "calendar", "birthdays", "departments", "leaders", "notices",
  "groups", "households", "visitors", "prayer-requests", "children-forms", "teens-forms",
];

/** Starter adds — reach & self-service for a growing church. */
const STARTER_ADDS = [
  "sms", "reminders", "member-ids", "qr-codes",
  "form-builder", "import-export", "auto-receipts", "follow-ups",
];

/** Pro adds — teams, deeper giving, content and facilities. */
const PRO_ADDS = [
  "custom-roles", "harvest", "pledges", "recurring-giving", "data-migration",
  "volunteers", "rosters", "volunteer-scheduling", "bookings",
  "sermons", "devotionals", "testimonies", "welfare",
];

/** Max adds — intelligence, automation, full finance, integration & scale. */
const MAX_ADDS = [
  "automations", "engagement-scoring", "advanced-reports", "auto-inactive", "counseling",
  "accounting", "budgets", "expenses", "fund-accounting", "assets",
  "api-access", "audit-log",
];

const STARTER_FEATURES = [...FREE_FEATURES, ...STARTER_ADDS];
const PRO_FEATURES = [...STARTER_FEATURES, ...PRO_ADDS];
const MAX_FEATURES = [...PRO_FEATURES, ...MAX_ADDS];

/** Feature keys grouped by the tier they unlock at — used by the plan editor
 *  matrix so it reads as a clean staircase, and re-usable elsewhere. */
export const FEATURE_TIERS = {
  core: FREE_FEATURES,
  starter: STARTER_ADDS,
  pro: PRO_ADDS,
  max: MAX_ADDS,
} as const;

export const DEFAULT_PLAN_TABLE: PlanTable = {
  free:    { members: 50,       teamUsers: 2,        features: FREE_FEATURES },
  starter: { members: 250,      teamUsers: 5,        features: STARTER_FEATURES },
  pro:     { members: 1000,     teamUsers: 15,       features: PRO_FEATURES },
  max:     { members: Infinity, teamUsers: Infinity, features: MAX_FEATURES },
};

/** Every feature key the product knows about — drives the plan editor's checkbox grid. */
export const ALL_FEATURES: string[] = [...MAX_FEATURES];

/** Base features every plan always includes — shown as "CORE" and not toggleable,
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
};

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
  "/app/sermons": "sermons",
  "/app/devotionals": "devotionals",
  "/app/testimonies": "testimonies",
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
