"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { moveToBin } from "@/lib/recycle-bin";
import { requireSession, assertCanWrite, assertCanDelete } from "@/lib/auth";
import { TRIGGER_CATALOG, DEFAULT_TEMPLATES, runSingleAutomation } from "@/lib/automations/run";
import { audit } from "@/lib/audit";
import type { Channel } from "@prisma/client";

export async function toggleAutomation(id: string, active: boolean) {
  const session = await requireSession();
  assertCanWrite(session, "reminders");
  await db.automation.updateMany({ where: { id, churchId: session.churchId }, data: { active } });
  revalidatePath("/app/reminders");
}

export async function createAutomation(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session, "reminders");

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

    const delayDaysRaw = String(formData.get("delayDays") ?? "").trim();
    const sendHourRaw = String(formData.get("sendHour") ?? "").trim();

    await db.automation.create({
      data: {
        churchId: session.churchId,
        name,
        description: def.description,
        trigger,
        channel,
        active: true,
        messageTemplate,
        ...(trigger === "visitor_followup"
          ? {
              delayDays: delayDaysRaw ? Math.min(30, Math.max(0, parseInt(delayDaysRaw, 10) || 3)) : 3,
              sendHour: sendHourRaw ? Math.min(23, Math.max(0, parseInt(sendHourRaw, 10))) : null,
            }
          : {}),
      },
    });
  }
  revalidatePath("/app/reminders");
}

/** Save the visitor_followup automation's own schedule (delay + optional local
 *  send hour) alongside its message, in one go. */
export async function updateAutomationSettings(
  id: string,
  opts: { messageTemplate: string; delayDays: number; sendHour: number | null },
) {
  const session = await requireSession();
  assertCanWrite(session, "reminders");
  const trimmed = opts.messageTemplate.trim();
  if (!trimmed) return { ok: false, error: "Template cannot be empty." };

  await db.automation.updateMany({
    where: { id, churchId: session.churchId },
    data: {
      messageTemplate: trimmed,
      delayDays: Math.min(30, Math.max(0, opts.delayDays || 0)),
      sendHour: opts.sendHour == null ? null : Math.min(23, Math.max(0, opts.sendHour)),
    },
  });
  revalidatePath("/app/reminders");
  return { ok: true };
}

export async function deleteAutomation(id: string) {
  const session = await requireSession();
  assertCanDelete(session);
  await moveToBin(session, "automation", "Automation", id);
  await db.automation.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/reminders");
}

export async function updateAutomationTemplate(id: string, template: string) {
  const session = await requireSession();
  assertCanWrite(session, "reminders");
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
  assertCanWrite(session, "reminders");
  const result = await runSingleAutomation(id, session.churchId);
  revalidatePath("/app/reminders");
  return result;
}

/** Save the built-in birthday automation settings (toggles, send hour, tz, digest day). */
export async function saveBirthdaySettings(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session, "reminders");
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

/** Save the "we have not seen you in a while" settings. */
export async function saveAbsenceSettings(input: {
  on: boolean; weeks: number; textMember: boolean; alertAdmins: boolean;
  maxTexts: number; repeatWeeks: number; createFollowUp: boolean; notifyUserIds: string[];
}) {
  const session = await requireSession();
  assertCanWrite(session, "reminders");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const weeks = Math.min(52, Math.max(1, Math.trunc(input.weeks) || 3));
  const maxTexts = Math.min(5, Math.max(1, Math.trunc(input.maxTexts) || 1));
  const repeatWeeks = Math.min(12, Math.max(1, Math.trunc(input.repeatWeeks) || 2));
  // Only people who belong to this church can be chosen.
  const users = input.notifyUserIds.length
    ? await db.user.findMany({ where: { churchId: session.churchId, id: { in: input.notifyUserIds } }, select: { id: true } })
    : [];
  await db.church.update({
    where: { id: session.churchId },
    data: {
      absenceOn: !!input.on, absenceWeeks: weeks, absenceTextMember: !!input.textMember, absenceAlertAdmins: !!input.alertAdmins,
      absenceMaxTexts: maxTexts, absenceRepeatWeeks: repeatWeeks, absenceCreateFollowUp: !!input.createFollowUp,
      absenceNotifyUserIds: users.map((u) => u.id),
    },
  });
  await audit(session, "update", "settings", input.on ? `Switched on "not seen in a while" after ${weeks} week(s)` : 'Switched off "not seen in a while"');
  revalidatePath("/app/reminders");
  return { ok: true as const };
}
