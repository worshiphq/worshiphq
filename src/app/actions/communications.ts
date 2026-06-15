"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { sendEmail } from "@/lib/integrations/email";
import { sendChurchSms } from "@/lib/sms/credits";
import type { Channel } from "@prisma/client";

/** Send (or stub-send) a broadcast and log it as a campaign. */
export async function sendBroadcast(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const name = String(formData.get("name") ?? "Broadcast").trim() || "Broadcast";
  const channel = (String(formData.get("channel") ?? "SMS") as Channel) || "SMS";
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return;

  // Resolve recipients for the church (everyone with the relevant contact field).
  const people = await db.person.findMany({
    where: { churchId: session.churchId, status: { not: "inactive" } },
    select: { phone: true, email: true },
  });
  const recipients =
    channel === "Email"
      ? people.map((p) => p.email).filter((e): e is string => !!e)
      : people.map((p) => p.phone).filter((p): p is string => !!p);

  let sent = recipients.length;

  if (recipients.length) {
    if (channel === "Email") {
      await sendEmail({ to: recipients, subject: name, html: `<p>${message}</p>` });
    } else {
      // SMS is billed against the church's prepaid credits.
      const result = await sendChurchSms(session.churchId, recipients, message, { note: name });
      if (result.insufficient) {
        redirect("/app/communications?error=credits");
      }
      sent = result.sent;
    }
  }

  await db.communication.create({
    data: {
      churchId: session.churchId,
      name,
      channel,
      body: message,
      segment: String(formData.get("segment") ?? "All members"),
      sent,
      delivered: sent, // optimistic in stub mode
      status: "sent",
    },
  });

  revalidatePath("/app/communications");
  revalidatePath("/app");
}
