"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, assertCanDelete } from "@/lib/auth";
import { TRIGGER_CATALOG, DEFAULT_TEMPLATES, runSingleAutomation } from "@/lib/automations/run";
import type { Channel } from "@prisma/client";

export async function toggleAutomation(id: string, active: boolean) {
  const session = await requireSession();
  assertCanWrite(session);
  await db.automation.updateMany({ where: { id, churchId: session.churchId }, data: { active } });
  revalidatePath("/app/reminders");
}

export async function createAutomation(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const trigger = String(formData.get("trigger") ?? "birthday");
  const channel = (String(formData.get("channel") ?? "SMS") as Channel) || "SMS";
  const def = TRIGGER_CATALOG[trigger] ?? TRIGGER_CATALOG.birthday;
  const name = String(formData.get("name") ?? "").trim() || def.name;
  const messageTemplate = DEFAULT_TEMPLATES[trigger] ?? null;

  await db.automation.create({
    data: {
      churchId: session.churchId,
      name,
      description: def.description,
      trigger,
      channel,
      active: true,
      messageTemplate,
    },
  });
  revalidatePath("/app/reminders");
}

export async function deleteAutomation(id: string) {
  const session = await requireSession();
  assertCanDelete(session);
  await db.automation.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/reminders");
}

export async function updateAutomationTemplate(id: string, template: string) {
  const session = await requireSession();
  assertCanWrite(session);
  const trimmed = template.trim();
  if (!trimmed) return { ok: false, error: "Template cannot be empty." };
  await db.automation.updateMany({
    where: { id, churchId: session.churchId },
    data: { messageTemplate: trimmed },
  });
  revalidatePath("/app/reminders");
  return { ok: true };
}

export async function runAutomationNow(id: string) {
  const session = await requireSession();
  assertCanWrite(session);
  const result = await runSingleAutomation(id, session.churchId);
  revalidatePath("/app/reminders");
  return result;
}
