import "server-only";
import { db } from "@/lib/db";
import { cache } from "react";

export type PlanId = "free" | "starter" | "pro" | "max";

const PLAN_RANK: Record<PlanId, number> = { free: 0, starter: 1, pro: 2, max: 3 };

export interface PlanLimits {
  members: number;
  teamUsers: number;
  features: string[];
}

const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    members: 50,
    teamUsers: 2,
    features: [
      "people", "attendance", "events", "giving", "dashboard", "reports",
      "children-forms", "teens-forms", "visitors", "prayer-requests",
      "groups", "households", "directory", "birthdays", "calendar",
      "departments", "leaders", "notices",
    ],
  },
  starter: {
    members: 250,
    teamUsers: 5,
    features: [
      "people", "attendance", "events", "giving", "dashboard", "reports",
      "children-forms", "teens-forms", "visitors", "prayer-requests",
      "groups", "households", "directory", "birthdays", "calendar",
      "departments", "leaders", "notices",
      "sms", "form-builder", "import-export", "member-ids", "qr-codes",
      "custom-roles", "harvest", "pledges", "recurring-giving",
      "auto-receipts", "reminders", "data-migration", "follow-ups",
      "sermons", "devotionals", "testimonies",
    ],
  },
  pro: {
    members: 1000,
    teamUsers: 15,
    features: [
      "people", "attendance", "events", "giving", "dashboard", "reports",
      "children-forms", "teens-forms", "visitors", "prayer-requests",
      "groups", "households", "directory", "birthdays", "calendar",
      "departments", "leaders", "notices",
      "sms", "form-builder", "import-export", "member-ids", "qr-codes",
      "custom-roles", "harvest", "pledges", "recurring-giving",
      "auto-receipts", "reminders", "data-migration", "follow-ups",
      "sermons", "devotionals", "testimonies",
      "automations", "volunteers", "rosters", "volunteer-scheduling",
      "engagement-scoring", "advanced-reports", "welfare", "counseling",
      "auto-inactive", "bookings",
    ],
  },
  max: {
    members: Infinity,
    teamUsers: Infinity,
    features: [
      "people", "attendance", "events", "giving", "dashboard", "reports",
      "children-forms", "teens-forms", "visitors", "prayer-requests",
      "groups", "households", "directory", "birthdays", "calendar",
      "departments", "leaders", "notices",
      "sms", "form-builder", "import-export", "member-ids", "qr-codes",
      "custom-roles", "harvest", "pledges", "recurring-giving",
      "auto-receipts", "reminders", "data-migration", "follow-ups",
      "sermons", "devotionals", "testimonies",
      "automations", "volunteers", "rosters", "volunteer-scheduling",
      "engagement-scoring", "advanced-reports", "welfare", "counseling",
      "auto-inactive", "bookings",
      "accounting", "budgets", "expenses", "fund-accounting",
      "assets", "api-access", "audit-log",
    ],
  },
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

export function getPlanLimits(plan: PlanId): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

export function planHasFeature(plan: PlanId, feature: string): boolean {
  return PLAN_LIMITS[plan]?.features.includes(feature) ?? false;
}

export function getMinimumPlan(feature: string): PlanId {
  for (const p of ["free", "starter", "pro", "max"] as PlanId[]) {
    if (PLAN_LIMITS[p].features.includes(feature)) return p;
  }
  return "max";
}

export function planRank(plan: PlanId): number {
  return PLAN_RANK[plan] ?? 0;
}

export const getChurchPlan = cache(async (churchId: string): Promise<PlanId> => {
  const sub = await db.subscription.findUnique({
    where: { churchId },
    select: { plan: true, status: true },
  });
  if (!sub) return "free";
  if (sub.status === "grace") return (sub.plan as PlanId) || "max";
  return (sub.plan as PlanId) || "free";
});

export function routeAllowedByPlan(plan: PlanId, href: string): boolean {
  const feature = getRouteFeature(href);
  if (!feature) return true;
  return planHasFeature(plan, feature);
}
