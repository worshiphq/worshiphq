"use server";

import { revalidatePath } from "next/cache";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * Save editable system-SMS overrides (roster reminder, follow-up assigned,
 * birthday digest, …). Stored as a JSON map on Church.messageTemplates. An
 * empty/whitespace value clears that key back to its built-in default.
 */
export async function saveSystemTemplates(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };

  let incoming: Record<string, unknown> = {};
  try { incoming = JSON.parse(String(formData.get("templates") ?? "{}")); } catch { /* ignore */ }

  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (typeof v === "string" && v.trim()) clean[k] = v.trim();
  }

  await db.church.update({
    where: { id: session.churchId },
    data: { messageTemplates: clean },
  });

  await audit(session, "update", "settings", "Edited system SMS templates");
  revalidatePath("/app/rosters");
  revalidatePath("/app/settings");
  return { ok: true as const };
}
