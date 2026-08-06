"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, assertCanDelete } from "@/lib/auth";
import { TRIGGER_CATALOG, DEFAULT_TEMPLATES, runSingleAutomation } from "@/lib/automations/run";
import { audit } from "@/lib/audit";
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

  if (trigger === "custom") {
    const customName = String(formData.get("customName") ?? "").trim() || "Custom reminder";
    const dateStr = String(formData.get("customDate") ?? "");
    const customDate = dateStr ? new Date(dateStr) : null;
    const customRecurrence = String(formData.get("customRecurrence") ?? "once");
    const audience = String(formData.get("audience") ?? "all");
    const messageTemplate = String(formData.get("messageTemplate") ?? "").trim() || null;

    await db.automation.create({
      data: {
        churchId: session.churchId,
        name: customName,
        description: `Custom reminder${customRecurrence !== "once" ? ` (${customRecurrence})` : ""}`,
        trigger: "custom",
        channel,
        active: true,
        messageTemplate,
        customDate,
        customRecurrence,
        audience,
      },
    });
  } else {
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
  }
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

/** Save the built-in birthday automation settings (toggles, send hour, tz, digest day). */
export async function saveBirthdaySettings(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };

  const hour = Math.min(23, Math.max(0, parseInt(String(formData.get("sendHour") ?? "8"), 10) || 8));
  const digestDay = Math.min(6, Math.max(0, parseInt(String(formData.get("digestDay") ?? "1"), 10) || 0));
  const tz = String(formData.get("timezone") ?? "").trim() || "Africa/Accra";

  await db.church.update({
    where: { id: session.churchId },
    data: {
      timezone: tz,
      birthdaySendHour: hour,
      birthdayWishOn: String(formData.get("wishOn") ?? "") === "on",
      birthdayAdminAlertOn: String(formData.get("adminAlertOn") ?? "") === "on",
      birthdayDigestOn: String(formData.get("digestOn") ?? "") === "on",
      birthdayDigestDay: digestDay,
    },
  });

  await audit(session, "update", "settings", "Updated birthday automation settings");
  revalidatePath("/app/birthdays");
  return { ok: true as const };
}
