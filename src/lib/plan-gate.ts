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

const FREE_FEATURES = [
  "people", "attendance", "events", "giving", "dashboard", "reports",
  "children-forms", "teens-forms", "visitors", "prayer-requests",
  "groups", "households", "directory", "birthdays", "calendar",
  "departments", "leaders", "notices",
];
const STARTER_FEATURES = [
  ...FREE_FEATURES,
  "sms", "form-builder", "import-export", "member-ids", "qr-codes",
  "custom-roles", "harvest", "pledges", "recurring-giving",
  "auto-receipts", "reminders", "data-migration", "follow-ups",
  "sermons", "devotionals", "testimonies",
];
const PRO_FEATURES = [
  ...STARTER_FEATURES,
  "automations", "volunteers", "rosters", "volunteer-scheduling",
  "engagement-scoring", "advanced-reports", "welfare", "counseling",
  "auto-inactive", "bookings",
];
const MAX_FEATURES = [
  ...PRO_FEATURES,
  "accounting", "budgets", "expenses", "fund-accounting",
  "assets", "api-access", "audit-log",
];

export const DEFAULT_PLAN_TABLE: PlanTable = {
  free:    { members: 50,       teamUsers: 2,        features: FREE_FEATURES },
  starter: { members: 250,      teamUsers: 5,        features: STARTER_FEATURES },
  pro:     { members: 1000,     teamUsers: 15,       features: PRO_FEATURES },
  max:     { members: Infinity, teamUsers: Infinity, features: MAX_FEATURES },
};

/** Every feature key the product knows about — drives the plan editor's checkbox grid. */
export const ALL_FEATURES: string[] = [...MAX_FEATURES];

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
