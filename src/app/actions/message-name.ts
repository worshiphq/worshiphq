"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { cleanMessageName } from "@/lib/sms/message-name";

/** Save the name line a church's texts start with (its full name, a short version, or its own wording). */
export async function saveMessageName(name: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const session = await requireSession();
  assertCanWrite(session, "communications");
  if (session.isDemo) return { ok: false, error: "This is the read-only demo." };
  const clean = cleanMessageName(name);
  if (clean.length < 2) return { ok: false, error: "Type at least 2 characters." };
  await db.church.update({ where: { id: session.churchId }, data: { smsPrefix: clean } });
  revalidatePath("/app/communications");
  revalidatePath("/app");
  return { ok: true, name: clean };
}
