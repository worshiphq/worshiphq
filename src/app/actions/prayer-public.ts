"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export async function submitPublicPrayerRequest(formData: FormData) {
  const churchSlug = String(formData.get("churchSlug") ?? "").trim();
  if (!churchSlug) return;

  const church = await db.church.findUnique({
    where: { slug: churchSlug },
    select: { id: true, isDemo: true },
  });
  if (!church || church.isDemo) return;

  const name = String(formData.get("name") ?? "").trim();
  const request = String(formData.get("request") ?? "").trim();
  const isAnonymous = formData.get("isAnonymous") === "on";
  if (!request) return;

  const displayName = isAnonymous || !name ? "Anonymous" : name;
  await db.prayerRequest.create({
    data: {
      churchId: church.id,
      name: displayName,
      request,
      isAnonymous: isAnonymous || !name,
    },
  });

  const { notifyChurchAdmins } = await import("@/lib/notify/admins");
  await notifyChurchAdmins(church.id, {
    subject: "New prayer request",
    sms: `🙏 New prayer request from ${displayName}: "${request.slice(0, 100)}${request.length > 100 ? "…" : ""}". Open WorshipHQ to respond.`,
  });

  redirect(`/pray/${churchSlug}/thank-you`);
}
