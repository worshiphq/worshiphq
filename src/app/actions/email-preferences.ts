"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readToken } from "@/lib/auth/tokens";

/** "Stop these emails": the address stops getting the email sequence and offers. Codes and receipts still go. */
export async function stopTipEmails(formData: FormData) {
  const t = String(formData.get("t") ?? "");
  const data = readToken<{ e: string }>("email-optout", t);
  if (!data?.e) redirect("/email-preferences?state=invalid");
  await db.emailOptOut.upsert({ where: { email: data.e }, update: {}, create: { email: data.e } });
  redirect(`/email-preferences?t=${encodeURIComponent(t)}&state=stopped`);
}

/** Changed their mind: start the emails again. */
export async function restartTipEmails(formData: FormData) {
  const t = String(formData.get("t") ?? "");
  const data = readToken<{ e: string }>("email-optout", t);
  if (!data?.e) redirect("/email-preferences?state=invalid");
  await db.emailOptOut.deleteMany({ where: { email: data.e } });
  redirect(`/email-preferences?t=${encodeURIComponent(t)}&state=restarted`);
}
