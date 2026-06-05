import type { Role } from "@/lib/demo/data";

/** Session shape — mirrors what Auth.js would provide. Client-safe (no server imports). */
export interface Session {
  name: string;
  email: string;
  role: Role;
  branch: string;
  avatarName: string;
}

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  Owner: ["*"],
  Admin: ["people", "attendance", "giving", "events", "volunteers", "communications", "reminders", "branches", "settings"],
  Finance: ["giving", "accounting", "people", "reminders"],
  Leader: ["people", "attendance", "events", "volunteers", "communications", "reminders"],
  Volunteer: ["people", "attendance", "events"],
};

export function can(role: Role, module: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms.includes("*") || perms.includes(module);
}
