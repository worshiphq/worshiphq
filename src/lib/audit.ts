import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function logAudit(opts: {
  churchId: string;
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
  detail?: string;
  meta?: Prisma.InputJsonValue;
}) {
  if (opts.userId === "demo" || opts.userId === "superadmin") return;
  try {
    await db.auditLog.create({ data: opts });
  } catch {
    // non-critical — never block the primary action
  }
}

/**
 * Convenience wrapper so mutating server actions can log with one line:
 *   await audit(session, "create", "group", `Created group "${name}"`, id);
 * Pulls churchId/userId from the session; safe to await (never throws).
 */
export async function audit(
  session: { churchId: string; userId: string },
  action: "create" | "update" | "delete" | string,
  entity: string,
  detail?: string,
  entityId?: string,
) {
  return logAudit({ churchId: session.churchId, userId: session.userId, action, entity, entityId, detail });
}
