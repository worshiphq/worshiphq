"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { sendSms } from "@/lib/integrations/sms";
import { sendEmail } from "@/lib/integrations/email";
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

  // Fire the (stubbed unless keys present) integration.
  if (recipients.length) {
    if (channel === "Email") {
      await sendEmail({ to: recipients, subject: name, html: `<p>${message}</p>` });
    } else {
      await sendSms(recipients, message);
    }
  }

  await db.communication.create({
    data: {
      churchId: session.churchId,
      name,
      channel,
      body: message,
      segment: String(formData.get("segment") ?? "All members"),
      sent: recipients.length,
      delivered: recipients.length, // optimistic in stub mode
      status: "sent",
    },
  });

  revalidatePath("/app/communications");
}
