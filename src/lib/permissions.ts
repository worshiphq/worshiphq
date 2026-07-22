import type { Role } from "@/lib/demo/data";

/** Coarse parent groups — kept for backward compatibility. Built-in roles and
 *  legacy custom roles are expressed in these; holding a parent grants every
 *  fine section beneath it (see SECTION_PARENT / hasSection). */
export const ALL_MODULES = [
  "people", "attendance", "events", "volunteers",
  "giving", "accounting", "harvest", "communications", "reminders",
  "settings",
] as const;

/** A single grantable section (one per tab/feature). `manageable` = has a
 *  meaningful "Manage" level beyond just viewing; view-only sections (reports,
 *  directory, audit log) omit it. `parent` ties it to a coarse module so
 *  built-in roles keep working without listing every fine key. */
export interface SectionDef {
  key: string;
  label: string;
  parent: (typeof ALL_MODULES)[number];
  manageable?: boolean;
}

/** Sections grouped by the category they appear under in the sidebar. This is
 *  the single source of truth for the roles checkbox matrix. */
export const SECTION_GROUPS: { category: string; sections: SectionDef[] }[] = [
  {
    category: "Overview",
    sections: [
      { key: "reports", label: "Reports & analytics", parent: "people" },
    ],
  },
  {
    category: "Congregation",
    sections: [
      { key: "people", label: "People", parent: "people", manageable: true },
      { key: "leaders", label: "Leaders", parent: "people", manageable: true },
      { key: "attendance", label: "Attendance", parent: "attendance", manageable: true },
      { key: "events", label: "Events", parent: "events", manageable: true },
      { key: "calendar", label: "Calendar", parent: "events" },
      { key: "volunteers", label: "Volunteers", parent: "volunteers", manageable: true },
      { key: "groups", label: "Groups", parent: "people", manageable: true },
      { key: "visitors", label: "Visitors", parent: "people", manageable: true },
      { key: "birthdays", label: "Birthdays", parent: "people" },
      { key: "directory", label: "Directory", parent: "people" },
      { key: "bookings", label: "Bookings", parent: "events", manageable: true },
      { key: "rosters", label: "Rosters", parent: "volunteers", manageable: true },
    ],
  },
  {
    category: "Finance & giving",
    sections: [
      { key: "accounting", label: "Accounting", parent: "accounting", manageable: true },
      { key: "giving", label: "Giving", parent: "giving", manageable: true },
      { key: "dayborn", label: "Day Born", parent: "giving", manageable: true },
      { key: "pledges", label: "Pledges", parent: "giving", manageable: true },
      { key: "harvest", label: "Harvest", parent: "harvest", manageable: true },
      { key: "expenses", label: "Expenses", parent: "accounting", manageable: true },
      { key: "budgets", label: "Budgets", parent: "accounting", manageable: true },
      { key: "welfare", label: "Welfare", parent: "giving", manageable: true },
    ],
  },
  {
    category: "Engagement",
    sections: [
      { key: "communications", label: "Communications", parent: "communications", manageable: true },
      { key: "reminders", label: "Reminders", parent: "reminders", manageable: true },
      { key: "follow-ups", label: "Follow-ups", parent: "people", manageable: true },
      { key: "prayer-requests", label: "Prayer requests", parent: "people", manageable: true },
      { key: "notices", label: "Notices", parent: "communications", manageable: true },
      { key: "sermons", label: "Sermons", parent: "events", manageable: true },
      { key: "devotionals", label: "Devotionals", parent: "communications", manageable: true },
      { key: "testimonies", label: "Testimonies", parent: "communications", manageable: true },
      { key: "counseling", label: "Counseling", parent: "people", manageable: true },
    ],
  },
  {
    category: "Organisation",
    sections: [
      { key: "assets", label: "Assets", parent: "settings", manageable: true },
      { key: "audit-log", label: "Audit log", parent: "settings" },
      { key: "settings", label: "Settings", parent: "settings", manageable: true },
    ],
  },
];

/** Flat list of every fine section definition. */
export const ALL_SECTIONS: SectionDef[] = SECTION_GROUPS.flatMap((g) => g.sections);

/** Fine key → coarse parent module. */
export const SECTION_PARENT: Record<string, string> = Object.fromEntries(
  ALL_SECTIONS.map((s) => [s.key, s.parent]),
);

/** Human labels for both fine and coarse keys. */
export const MODULE_LABELS: Record<string, string> = {
  ...Object.fromEntries(ALL_SECTIONS.map((s) => [s.key, s.label])),
  people: "People", attendance: "Attendance", events: "Events", volunteers: "Volunteers",
  giving: "Giving", accounting: "Accounting", harvest: "Harvest",
  communications: "Communications", reminders: "Reminders", settings: "Settings",
};

/** Session shape — client-safe (no server imports). Backed by a real DB user. */
export interface Session {
  userId: string;
  name: string;
  email: string;
  role: Role;
  /** Optional custom role name (when assigned one) for display. */
  customRole?: string | null;
  /** Resolved sections this user can SEE (fine and/or coarse keys). */
  sections: string[];
  /** Sections this user can MANAGE (add/edit). Subset of what they can see. */
  manageSections: string[];
  /** Whether this user may delete records (built-ins: yes; custom roles: configurable). */
  canDelete: boolean;
  churchId: string;
  churchName: string;
  /** When set, this is a scoped department-budget leader — they only see their
   *  department's budget, expenses and income. */
  budgetDepartmentId?: string | null;
  budgetDepartmentName?: string | null;
  /** @deprecated Branch feature removed — kept for data compatibility. */
  branch: string;
  /** @deprecated Branch feature removed — kept for data compatibility. */
  branchId?: string | null;
  avatarName: string;
  avatarUrl?: string | null;
  isDemo: boolean;
  /** True when a SuperAdmin is viewing this church as invisible support. */
  impersonating?: boolean;
  /** Whether this user has completed phone verification (admins must). */
  phoneVerified?: boolean;
}

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  Owner: ["*"],
  Admin: ["people", "attendance", "giving", "events", "volunteers", "communications", "reminders", "settings", "accounting", "harvest"],
  Pastor: ["people", "attendance", "giving", "events", "volunteers", "communications", "reminders", "settings"],
  Finance: ["giving", "accounting", "harvest", "people", "reminders"],
  Media: ["communications", "events", "people"],
  Leader: ["people", "attendance", "events", "volunteers", "communications", "reminders"],
  Volunteer: ["people", "attendance", "events"],
};

/** Resolve a built-in role's module list (expanding the "*" wildcard). */
export function modulesForRole(role: Role): string[] {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes("*") ? [...ALL_MODULES] : perms;
}

export function can(role: Role, module: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms.includes("*") || perms.includes(module);
}

/** Does this set of granted keys cover `module`? A grant covers a section when
 *  it lists the section's own fine key, its coarse parent, or the wildcard. */
export function granted(keys: string[], module: string): boolean {
  if (keys.includes("*") || keys.includes(module)) return true;
  const parent = SECTION_PARENT[module];
  return parent ? keys.includes(parent) : false;
}

/** Whether a session can SEE a given section. Dashboard is always allowed. */
export function hasSection(session: Pick<Session, "sections">, module: string): boolean {
  if (module === "dashboard") return true;
  return granted(session.sections, module);
}

/** Whether a session can MANAGE (add/edit) a given section. */
export function canManage(session: Pick<Session, "manageSections">, module: string): boolean {
  return granted(session.manageSections ?? [], module);
}
