import type { Role } from "@/lib/demo/data";

/** Session shape — client-safe (no server imports). Backed by a real DB user. */
export interface Session {
  userId: string;
  name: string;
  email: string;
  role: Role;
  churchId: string;
  churchName: string;
  branch: string;
  branchId?: string | null;
  avatarName: string;
  isDemo: boolean;
}

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  Owner: ["*"],
  Admin: ["people", "attendance", "giving", "events", "volunteers", "communications", "reminders", "branches", "settings", "accounting"],
  Pastor: ["people", "attendance", "giving", "events", "volunteers", "communications", "reminders", "settings"],
  Finance: ["giving", "accounting", "people", "reminders"],
  Media: ["communications", "events", "people"],
  Leader: ["people", "attendance", "events", "volunteers", "communications", "reminders"],
  Volunteer: ["people", "attendance", "events"],
};

export function can(role: Role, module: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms.includes("*") || perms.includes(module);
}
