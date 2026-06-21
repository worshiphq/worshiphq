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
