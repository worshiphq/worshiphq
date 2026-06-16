"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, assertCanDelete } from "@/lib/auth";
import type { Channel } from "@prisma/client";

const TRIGGER_DEFAULTS: Record<string, { name: string; description: string }> = {
  birthday: { name: "Birthday blessings", description: "Wishes a member happy birthday on the day." },
  anniversary: { name: "Anniversary wishes", description: "Celebrates a member's anniversary on the day." },
  visitor_followup: { name: "First-time visitor follow-up", description: "Welcomes new visitors a few days after they register." },
  lapsed: { name: "We miss you", description: "Gently checks in on members who've gone inactive." },
};

export async function toggleAutomation(id: string, active: boolean) {
  const session = await requireSession();
  assertCanWrite(session);
  await db.automation.updateMany({ where: { id, churchId: session.churchId }, data: { active } });
  revalidatePath("/app/reminders");
}

/** Create an automation from a trigger type. */
export async function createAutomation(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const trigger = String(formData.get("trigger") ?? "birthday");
  const channel = (String(formData.get("channel") ?? "SMS") as Channel) || "SMS";
  const def = TRIGGER_DEFAULTS[trigger] ?? TRIGGER_DEFAULTS.birthday;
  const name = String(formData.get("name") ?? "").trim() || def.name;

  await db.automation.create({
    data: {
      churchId: session.churchId,
      name,
      description: def.description,
      trigger,
      channel,
      active: true,
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
