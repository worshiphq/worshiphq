export type PlanId = "free" | "starter" | "pro" | "max";

const PLAN_FEATURES: Record<PlanId, string[]> = {
  free: [
    "people", "attendance", "events", "giving", "dashboard", "reports",
    "visitors", "prayer-requests", "groups", "directory", "birthdays",
    "calendar", "leaders", "notices",
  ],
  starter: [
    "people", "attendance", "events", "giving", "dashboard", "reports",
    "visitors", "prayer-requests", "groups", "directory", "birthdays",
    "calendar", "leaders", "notices",
    "sms", "harvest", "pledges", "reminders", "follow-ups",
    "sermons", "devotionals", "testimonies",
  ],
  pro: [
    "people", "attendance", "events", "giving", "dashboard", "reports",
    "visitors", "prayer-requests", "groups", "directory", "birthdays",
    "calendar", "leaders", "notices",
    "sms", "harvest", "pledges", "reminders", "follow-ups",
    "sermons", "devotionals", "testimonies",
    "volunteers", "rosters", "bookings", "welfare", "counseling",
  ],
  max: [
    "people", "attendance", "events", "giving", "dashboard", "reports",
    "visitors", "prayer-requests", "groups", "directory", "birthdays",
    "calendar", "leaders", "notices",
    "sms", "harvest", "pledges", "reminders", "follow-ups",
    "sermons", "devotionals", "testimonies",
    "volunteers", "rosters", "bookings", "welfare", "counseling",
    "accounting", "budgets", "expenses", "assets", "audit-log",
  ],
};

const ROUTE_FEATURE_MAP: Record<string, string> = {
  "/communications": "sms",
  "/reminders": "reminders",
  "/harvest": "harvest",
  "/pledges": "pledges",
  "/volunteers": "volunteers",
  "/rosters": "rosters",
  "/bookings": "bookings",
  "/welfare": "welfare",
  "/counseling": "counseling",
  "/accounting": "accounting",
  "/budgets": "budgets",
  "/expenses": "expenses",
  "/assets": "assets",
  "/audit-log": "audit-log",
  "/follow-ups": "follow-ups",
  "/sermons": "sermons",
  "/devotionals": "devotionals",
  "/testimonies": "testimonies",
};

export function routeAllowedByPlan(plan: string, href: string): boolean {
  const feature = ROUTE_FEATURE_MAP[href];
  if (!feature) return true;
  const features = PLAN_FEATURES[(plan as PlanId)] ?? PLAN_FEATURES.free;
  return features.includes(feature);
}

export function getMinimumPlan(href: string): PlanId | null {
  const feature = ROUTE_FEATURE_MAP[href];
  if (!feature) return null;
  for (const p of ["free", "starter", "pro", "max"] as PlanId[]) {
    if (PLAN_FEATURES[p].includes(feature)) return p;
  }
  return "max";
}
