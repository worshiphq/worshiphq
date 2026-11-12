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

/** Who each built-in role is usually for. What it can actually use is shown separately, from its real settings. */
export const ROLE_BLURB: Record<string, string> = {
  Owner: "The person who owns the account. Can do everything, including billing. There is only one.",
  Admin: "For the person who runs the account with you, such as the church secretary.",
  Pastor: "For pastors and associate pastors.",
  Finance: "For the treasurer and the finance team.",
  Media: "For the media and communications team.",
  Leader: "For ministry and department leaders.",
  Volunteer: "For ushers and helpers on Sunday.",
};

/**
 * How a church has adjusted a built-in role. Adjusted on the Team screen it is { view, manage, canDelete } (exact,
 * like a custom role). Adjusted before that it is a plain list of areas, each viewed and edited.
 */
export type RoleOverride = string[] | { view: string[]; manage: string[]; canDelete?: boolean };
export type RolePermissions = Record<string, RoleOverride>;

/** Ready-made starting points for a custom role (sections it can view, and the ones it can also edit). */
export const ROLE_TEMPLATES: { name: string; blurb: string; view: string[]; manage: string[] }[] = [
  { name: "Usher", blurb: "Marks attendance and welcomes visitors", view: ["attendance", "visitors", "people", "calendar"], manage: ["attendance", "visitors"] },
  { name: "Treasurer", blurb: "Records giving, Day Born, pledges and expenses", view: ["giving", "dayborn", "pledges", "harvest", "expenses", "accounting", "people", "calendar"], manage: ["giving", "dayborn", "pledges", "harvest", "expenses", "accounting"] },
  { name: "Secretary", blurb: "Keeps member records and sends notices", view: ["people", "visitors", "groups", "birthdays", "directory", "communications", "notices", "calendar"], manage: ["people", "visitors", "groups", "notices"] },
  { name: "Follow-up team", blurb: "Calls visitors and members who were missing", view: ["follow-ups", "visitors", "people", "prayer-requests", "calendar"], manage: ["follow-ups", "prayer-requests"] },
  { name: "Media team", blurb: "Sermons, devotionals, testimonies and notices", view: ["sermons", "devotionals", "testimonies", "notices", "events", "calendar"], manage: ["sermons", "devotionals", "testimonies", "notices"] },
];

/** The sections a built-in role holds in this church (its own settings override the defaults). */
export function builtinKeys(role: string, overrides: RolePermissions | null): string[] {
  if (role === "Owner") return ["*"];
  const o = overrides?.[role];
  if (o && !Array.isArray(o)) return o.view;
  return o ?? ROLE_PERMISSIONS[role as Role] ?? [];
}

/** A built-in role as exact View / Edit lists, for the editor (areas are opened up into their sections). */
export function builtinExact(role: string, overrides: RolePermissions | null): { view: string[]; manage: string[]; canDelete: boolean } {
  const o = overrides?.[role];
  if (o && !Array.isArray(o)) return { view: o.view, manage: o.manage, canDelete: o.canDelete !== false };
  const keys = o ?? ROLE_PERMISSIONS[role as Role] ?? [];
  const all = SECTION_GROUPS.flatMap((g) => g.sections);
  const view = all.filter((s) => granted(keys, s.key)).map((s) => s.key);
  return { view, manage: view.filter((k) => all.find((s) => s.key === k)?.manageable), canDelete: true };
}

export type Access = { all: boolean; budgetOnly?: string; view: string[]; manage: string[]; exact: boolean };

export function accessFor(choice: TeamRoleChoice, overrides: RolePermissions | null): Access {
  if (choice.kind === "budget") return { all: false, budgetOnly: choice.departmentName, view: [], manage: [], exact: true };
  if (choice.kind === "custom") return { all: false, view: choice.sections, manage: choice.manageSections, exact: true };
  const o = overrides?.[choice.role];
  if (choice.role !== "Owner" && o && !Array.isArray(o)) return { all: false, view: o.view, manage: o.manage, exact: true };
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
