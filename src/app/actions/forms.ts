"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { FORM_KINDS, isFormKind } from "@/lib/forms/kinds";
import type { FormField } from "@/lib/forms/registration";

const PUBLIC_ROOT: Record<string, string> = {
  join: "/join", visitor: "/visit", children: "/children", teens: "/teens", prayer: "/pray",
  testimony: "/testify", counsel: "/counsel", give: "/give", book: "/book", baptism: "/app/baptisms",
};

/**
 * Save one of the church's public forms. The definition is run through the same
 * resolver the public page uses, so only valid fields (and steps) are ever stored.
 */
export async function saveFormDefinition(kind: string, definition: string): Promise<{ ok: true; fields: FormField[] } | { ok: false; error: string }> {
  const session = await requireSession();
  if (session.role !== "Owner" && session.role !== "Admin") return { ok: false, error: "Only the Main Admin or an admin can change forms." };
  if (session.isDemo) return { ok: false, error: "Read-only demo." };
  if (!isFormKind(kind)) return { ok: false, error: "Unknown form." };

  let parsed: unknown;
  try { parsed = JSON.parse(definition); } catch { return { ok: false, error: "That form could not be read." }; }
  if (!Array.isArray(parsed) || parsed.length > 120) return { ok: false, error: "Too many questions. Keep it under 120." };

  const info = FORM_KINDS[kind];
  const fields = info.resolve(parsed);
  await db.church.update({ where: { id: session.churchId }, data: { [info.column]: fields as object } });
  await audit(session, "update", "settings", `Changed the ${info.label} form`);
  revalidatePath("/app/settings");
  revalidatePath(PUBLIC_ROOT[kind], "layout");
  return { ok: true, fields };
}
