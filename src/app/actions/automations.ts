"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";

export async function toggleAutomation(id: string, active: boolean) {
  const session = await requireSession();
  assertCanWrite(session);
  await db.automation.updateMany({ where: { id, churchId: session.churchId }, data: { active } });
  revalidatePath("/app/reminders");
}
