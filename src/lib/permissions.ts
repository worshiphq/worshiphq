import type { Role } from "@/lib/demo/data";

/** Every gateable module/section in the app. */
export const ALL_MODULES = [
  "people", "attendance", "events", "volunteers",
  "giving", "accounting", "harvest", "communications", "reminders",
  "branches", "settings",
] as const;

/** Session shape — client-safe (no server imports). Backed by a real DB user. */
export interface Session {
  userId: string;
  name: string;
  email: string;
  role: Role;
  /** Optional custom role name (when assigned one) for display. */
  customRole?: string | null;
  /** Resolved sections this user can see (module keys; dashboard always allowed). */
  sections: string[];
  /** Whether this user may delete records (built-ins: yes; custom roles: configurable). */
  canDelete: boolean;
  churchId: string;
  churchName: string;
  branch: string;
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
  Admin: ["people", "attendance", "giving", "events", "volunteers", "communications", "reminders", "branches", "settings", "accounting", "harvest"],
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

/** Whether a session can see a given module/section. Dashboard is always allowed. */
export function hasSection(session: Pick<Session, "sections">, module: string): boolean {
  if (module === "dashboard") return true;
  return session.sections.includes(module);
}
