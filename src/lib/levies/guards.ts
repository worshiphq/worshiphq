// Who may do what with levies and service income. Pure (permissions and plan keys only), so it can be tested directly.
import { hasSection, canManage, type Session } from "@/lib/permissions";

type S = Pick<Session, "sections" | "manageSections" | "exactSections" | "canDelete" | "role" | "isDemo" | "impersonating" | "planLocked">;

export interface LevyAccess {
  see: boolean;
  manage: boolean;
  del: boolean;
  /** Reopen a closed period, waive, or leave a changed period as it was: Main Admin and Admins only. */
  reopen: boolean;
  /** The plan feature that is locked for this church (pages redirect to billing), or null. */
  lockedFeature: string | null;
  /** Locked for saving. Support (impersonating) may still save, matching assertCanWrite. */
  writeLocked: boolean;
  /** Linked-church oversight (Max). */
  branchLocked: boolean;
}

function access(s: S, section: string, feature: string): LevyAccess {
  const see = hasSection(s, section);
  const locked = !s.isDemo && !!s.planLocked?.includes(feature);
  const writeLocked = locked && !s.impersonating;
  const manage = see && !s.isDemo && canManage(s, section) && !writeLocked;
  return {
    see,
    manage,
    del: manage && !!s.canDelete,
    reopen: manage && (s.role === "Owner" || s.role === "Admin"),
    lockedFeature: locked ? feature : null,
    writeLocked,
    branchLocked: !s.isDemo && !!s.planLocked?.includes("linked-churches"),
  };
}

export const levyAccess = (s: S) => access(s, "levies", "levies");
export const serviceIncomeAccess = (s: S) => access(s, "service-income", "service-income");
