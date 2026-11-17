/**
 * How a signed-in person's sections are worked out, pulled out of _loadSession so it can be tested with tsx. PURE.
 *
 * Payroll is private: a role (built-in, church override or custom) can never carry "payroll" or "my-pay". Payroll comes
 * only from User.payrollAccess, which only the Main Admin sets, plus the Main Admin themselves. "my-pay" comes only from
 * being linked to a staff record.
 */
import { PRIVATE_SECTIONS, modulesForRole } from "@/lib/permissions";
import type { Role } from "@/lib/demo/data";

export interface ResolveInput {
  role: Role;
  customRole?: { sections: string[]; manageSections: string[]; manageSplit: boolean; canDelete: boolean } | null;
  churchOverrides?: Record<string, unknown> | null;
  payrollAccess?: string | null;
  staffPortalOnly?: boolean;
  isOwner?: boolean;
  hasStaffLink?: boolean;
  /** Decision 1: the Main Admin manages payroll by default. */
  ownerGetsPayroll?: boolean;
  /** Payroll is locked by the plan: no payroll, staff or my-pay sections at all. */
  payrollLocked?: boolean;
}

export interface ResolvedAccess {
  sections: string[];
  manageSections: string[];
  exactSections: boolean;
  canDelete: boolean;
  payroll: "view" | "manage" | null;
  myPay: boolean;
}

const strip = (keys: string[]) => keys.filter((k) => !PRIVATE_SECTIONS.includes(k));
const add = (keys: string[], ...more: string[]) => Array.from(new Set([...keys, ...more]));

export function normalisePayrollAccess(v: unknown): "view" | "manage" | null {
  return v === "view" || v === "manage" ? v : null;
}

export function resolveAccess(i: ResolveInput): ResolvedAccess {
  // A staff self-service login sees only My pay.
  if (i.staffPortalOnly) {
    return { sections: ["my-pay"], manageSections: [], exactSections: true, canDelete: false, payroll: null, myPay: true };
  }

  // 1. Role sections exactly as before.
  const overrides = i.churchOverrides ?? {};
  const own = overrides[i.role];
  const precise = !i.customRole && own && typeof own === "object" && !Array.isArray(own)
    ? (own as { view?: string[]; manage?: string[]; canDelete?: boolean })
    : null;
  let sections = i.customRole
    ? i.customRole.sections
    : precise ? (precise.view ?? []) : (Array.isArray(own) ? (own as string[]) : modulesForRole(i.role));
  let manageSections = i.customRole
    ? (i.customRole.manageSplit ? i.customRole.manageSections : i.customRole.sections)
    : precise ? (precise.manage ?? []).filter((k) => sections.includes(k)) : sections;
  const canDelete = i.customRole ? i.customRole.canDelete : precise ? precise.canDelete !== false : true;
  const exactSections = !!i.customRole || !!precise;

  // 2. Never from a role.
  sections = strip(sections);
  manageSections = strip(manageSections);

  // 3. Payroll level.
  let payroll: "view" | "manage" | null = i.isOwner && i.ownerGetsPayroll !== false ? "manage" : normalisePayrollAccess(i.payrollAccess);
  if (i.payrollLocked) payroll = null;

  // 4. Payroll holders also see Staff (and manage it when they manage payroll).
  if (payroll) {
    sections = add(sections, "payroll", "staff");
    if (payroll === "manage") manageSections = add(manageSections, "payroll", "staff");
  }

  // 5. Linked staff get My pay.
  const myPay = !!i.hasStaffLink && !i.payrollLocked;
  if (myPay) sections = add(sections, "my-pay");

  return { sections, manageSections, exactSections, canDelete, payroll, myPay };
}
