import { nav, navSection } from "@/config/nav";
import { ALL_MODULES, MODULE_LABELS, ROLE_PERMISSIONS, SECTION_GROUPS, granted } from "@/lib/permissions";
import type { Role } from "@/lib/demo/data";

/**
 * What a team member can open, worked out the same way the app does when they sign in, so the Team screen can show
 * "what they see" without guessing. Client-safe (no server imports).
 */

export type TeamRoleChoice =
  | { kind: "builtin"; role: Role }
  | { kind: "custom"; id: string; name: string; sections: string[]; manageSections: string[]; canDelete: boolean }
  | { kind: "budget"; departmentId: string; departmentName: string };

/** One line on what each built-in role is for, in plain words. */
export const ROLE_BLURB: Record<string, string> = {
  Owner: "Full control of the church account, including billing. There is only one.",
  Admin: "Runs the account day to day: every section, the team and settings. Billing stays with the Main Admin.",
  Pastor: "Looks after the flock: people, attendance, giving, events, volunteers and messages.",
  Finance: "Handles the money: giving, accounting, harvest and reminders, plus the member list.",
  Media: "Sends messages and notices, runs events, and sees the member list.",
  Leader: "Leads a ministry: people, attendance, events, volunteers, messages and reminders.",
  Volunteer: "Helps on the day: marks attendance and sees people and events.",
};

/** Ready-made starting points for a custom role (sections it can view, and the ones it can also edit). */
export const ROLE_TEMPLATES: { name: string; blurb: string; view: string[]; manage: string[] }[] = [
  { name: "Usher", blurb: "Marks attendance and welcomes visitors", view: ["attendance", "visitors", "people", "calendar"], manage: ["attendance", "visitors"] },
  { name: "Treasurer", blurb: "Records giving, Day Born, pledges and expenses", view: ["giving", "dayborn", "pledges", "harvest", "expenses", "accounting", "people", "calendar"], manage: ["giving", "dayborn", "pledges", "harvest", "expenses", "accounting"] },
  { name: "Secretary", blurb: "Keeps member records and sends notices", view: ["people", "visitors", "groups", "birthdays", "directory", "communications", "notices", "calendar"], manage: ["people", "visitors", "groups", "notices"] },
  { name: "Follow-up team", blurb: "Calls visitors and members who were missing", view: ["follow-ups", "visitors", "people", "prayer-requests", "calendar"], manage: ["follow-ups", "prayer-requests"] },
  { name: "Media team", blurb: "Sermons, devotionals, testimonies and notices", view: ["sermons", "devotionals", "testimonies", "notices", "events", "calendar"], manage: ["sermons", "devotionals", "testimonies", "notices"] },
];

/** The sections a built-in role holds in this church (its own settings override the defaults). */
export function builtinKeys(role: string, overrides: Record<string, string[]> | null): string[] {
  if (role === "Owner") return ["*"];
  return overrides?.[role] ?? ROLE_PERMISSIONS[role as Role] ?? [];
}

export type Access = { all: boolean; budgetOnly?: string; view: string[]; manage: string[]; exact: boolean };

export function accessFor(choice: TeamRoleChoice, overrides: Record<string, string[]> | null): Access {
  if (choice.kind === "budget") return { all: false, budgetOnly: choice.departmentName, view: [], manage: [], exact: true };
  if (choice.kind === "custom") return { all: false, view: choice.sections, manage: choice.manageSections, exact: true };
  const keys = builtinKeys(choice.role, overrides);
  return { all: keys.includes("*"), view: keys, manage: keys, exact: false };
}

/** The menu a person with this access sees, grouped like the sidebar. */
export function menuFor(a: Access): { title: string; items: { label: string; edit: boolean }[] }[] {
  if (a.budgetOnly) return [{ title: "Budget", items: [{ label: `${a.budgetOnly} budget, income and expenses`, edit: true }] }];
  return nav
    .map((s) => ({
      title: s.title ?? "Overview",
      items: s.items
        .filter((i) => {
          const k = navSection(i);
          return k === "dashboard" || a.all || granted(a.view, k, a.exact);
        })
        .map((i) => {
          const k = navSection(i);
          return { label: i.label, edit: k !== "dashboard" && (a.all || granted(a.manage, k, a.exact)) };
        }),
    }))
    .filter((g) => g.items.length > 0);
}

/** "People, Attendance, Giving and 4 more" */
export function accessSummary(a: Access, max = 4): string {
  if (a.all) return "Everything";
  if (a.budgetOnly) return `Only the ${a.budgetOnly} budget`;
  const labels = menuFor(a).flatMap((g) => g.items.map((i) => i.label)).filter((l) => l !== "Dashboard");
  if (labels.length === 0) return "Only the dashboard";
  return labels.length <= max ? labels.join(", ") : `${labels.slice(0, max).join(", ")} and ${labels.length - max} more`;
}

/** The coarse areas built-in roles are made of, with what each one opens. */
export const AREAS = ALL_MODULES.map((m) => ({
  key: m as string,
  label: MODULE_LABELS[m] ?? m,
  includes: SECTION_GROUPS.flatMap((g) => g.sections).filter((s) => s.parent === m).map((s) => s.label),
}));
