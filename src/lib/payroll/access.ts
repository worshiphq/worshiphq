import "server-only";
import { getSession, assertCanWrite, planLockFor, PlanLockedError, DemoReadOnlyError, type Session } from "@/lib/auth";
import { PayrollError, StaleRunError } from "@/lib/payroll/engine";

export type ActionResult = { ok: true; message?: string; warnings?: string[] } | { ok: false; error: string };

/**
 * The session if it may use payroll at `level`, otherwise a plain refusal. Covers the demo, a suspended church, the
 * plan lock, support (never: decision 2) and the person's own payroll access (granted only by the Main Admin).
 */
export async function payrollActor(level: "view" | "manage"): Promise<{ ok: true; session: Session } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  if (session.impersonating) return { ok: false, error: "Payroll is private to the church. WorshipHQ support cannot open it." };
  if (session.isDemo) return { ok: false, error: "This is the read-only demo. Create a free account to make changes." };
  if (planLockFor(session, "payroll")) return { ok: false, error: "Staff, leave and payroll is part of the Max plan. The Main Admin can upgrade in Settings, Billing." };
  if (!session.payroll) return { ok: false, error: "Only people the Main Admin has given payroll access can do this." };
  if (level === "manage") {
    if (session.payroll !== "manage") return { ok: false, error: "You can view payroll but not change it." };
    try { assertCanWrite(session, "payroll"); } catch (e) { return { ok: false, error: (e as Error).message }; }
  }
  return { ok: true, session };
}

/** Staff records (no pay) at view or manage level. */
export async function staffActor(level: "view" | "manage"): Promise<{ ok: true; session: Session } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  if (planLockFor(session, "staff") && !session.impersonating) return { ok: false, error: "Staff, leave and payroll is part of the Max plan." };
  if (level === "manage") {
    try { assertCanWrite(session, "staff"); } catch (e) { return { ok: false, error: (e as Error).message }; }
  } else {
    const { hasSection } = await import("@/lib/permissions");
    if (!hasSection(session, "staff")) return { ok: false, error: "Your role cannot see staff records." };
  }
  return { ok: true, session };
}

export const actorOf = (s: Session) => ({ id: s.userId, name: s.name });

/** Turn an engine error into a result for the client; anything unexpected is logged and hidden. */
export function errorResult(e: unknown): { ok: false; error: string } {
  if (e instanceof PayrollError || e instanceof StaleRunError || e instanceof PlanLockedError || e instanceof DemoReadOnlyError) return { ok: false, error: e.message };
  const code = (e as { code?: string })?.code;
  if (code === "P2002") return { ok: false, error: "That already exists. Refresh the page and try again." };
  if (code === "P2034") return { ok: false, error: "Someone else was saving at the same moment. Please try again." };
  console.error("[payroll]", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}
