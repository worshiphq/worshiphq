"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { itemByKey } from "@/lib/messages/catalog";
import { canManage } from "@/lib/permissions";

/** Editing the church's messages needs Manage on at least one of the areas that send them. */
function assertCanEditMessages(session: Awaited<ReturnType<typeof requireSession>>) {
  const ok = ["communications", "settings", "rosters", "reminders", "giving", "welfare"].some((m) => canManage(session, m));
  if (!ok) throw new Error("Your role can view this but not make changes to it.");
}

/**
 * Save editable system-SMS overrides (roster reminder, follow-up assigned,
 * birthday digest, …). Stored as a JSON map on Church.messageTemplates. An
 * empty/whitespace value clears that key back to its built-in default.
 */
export async function saveSystemTemplates(formData: FormData) {
  const session = await requireSession();
  assertCanEditMessages(session);
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

/**
 * Save (or reset) one message. `text` null or empty puts it back to the built-in
 * wording. Works for every kind of message: the shared list, a column on the
 * church, or the text of an automation.
 */
export async function saveMessageTemplate(key: string, text: string | null) {
  const session = await requireSession();
  assertCanEditMessages(session);
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const item = itemByKey(key);
  if (!item) return { ok: false as const, error: "Unknown message." };

  const clean = (text ?? "").trim().slice(0, 1000);
  const value = clean && clean !== item.default.trim() ? clean : null;

  if (item.store === "registry" || item.store === "automation") {
    const church = await db.church.findUnique({ where: { id: session.churchId }, select: { messageTemplates: true } });
    const map = { ...((church?.messageTemplates as Record<string, string> | null) ?? {}) };
    if (value) map[key] = value; else delete map[key];
    await db.church.update({ where: { id: session.churchId }, data: { messageTemplates: map } });
    // Keep the automation's own copy in step, so a text can be written before the automation is switched on.
    if (item.store === "automation") await db.automation.updateMany({ where: { churchId: session.churchId, trigger: item.field! }, data: { messageTemplate: value } });
  } else {
    await db.church.update({ where: { id: session.churchId }, data: { [item.field!]: value } });
  }

  await audit(session, "update", "settings", `Edited the message "${item.label}"`);
  for (const path of ["/app/messages", "/app/settings", "/app/communications", "/app/rosters", "/app/birthdays", "/app/reminders"]) revalidatePath(path);
  return { ok: true as const, reset: value === null };
}
