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

  await db.prayerRequest.create({
    data: {
      churchId: church.id,
      name: isAnonymous || !name ? "Anonymous" : name,
      request,
      isAnonymous: isAnonymous || !name,
    },
  });

  redirect(`/pray/${churchSlug}/thank-you`);
}
