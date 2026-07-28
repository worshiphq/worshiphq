"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { notifyChurchAdmins } from "@/lib/notify/admins";

/** Public: a member/visitor submits a testimony for the church to review. */
export async function submitPublicTestimony(formData: FormData) {
  const churchSlug = String(formData.get("churchSlug") ?? "").trim();
  if (!churchSlug) return;

  const church = await db.church.findUnique({
    where: { slug: churchSlug },
    select: { id: true, isDemo: true },
  });
  if (!church || church.isDemo) return;

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return;

  let category = String(formData.get("category") ?? "praise").trim();
  const categoryOther = String(formData.get("categoryOther") ?? "").trim();
  if (category === "other" && categoryOther) category = categoryOther;
  const anonymous = formData.get("anonymous") === "on";
  const name = String(formData.get("name") ?? "").trim();

  await db.testimony.create({
    data: {
      churchId: church.id,
      title,
      body: anonymous || !name ? body : `${body}\n\n— ${name}`,
      category,
      anonymous: anonymous || !name,
      status: "pending", // admin reviews before it's shared publicly
    },
  });

  await notifyChurchAdmins(church.id, {
    subject: "New testimony submitted",
    sms: `✨ A member submitted a testimony: "${title}". Open WorshipHQ to review & approve it.`,
  });

  redirect(`/testify/${churchSlug}/thank-you`);
}

/** Public: a member/visitor requests counselling. */
export async function submitCounselingRequest(formData: FormData) {
  const churchSlug = String(formData.get("churchSlug") ?? "").trim();
  if (!churchSlug) return;

  const church = await db.church.findUnique({
    where: { slug: churchSlug },
    select: { id: true, isDemo: true },
  });
  if (!church || church.isDemo) return;

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const type = String(formData.get("type") ?? "general").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!name || !reason) return;

  await db.counselingSession.create({
    data: {
      churchId: church.id,
      summary: `[Request] ${name}${phone ? ` (${phone})` : ""}: ${reason}`,
      type,
      status: "open",
      confidential: true,
    },
  });

  await notifyChurchAdmins(church.id, {
    subject: "New counselling request",
    sms: `🤝 ${name} requested counselling (${type}). Open WorshipHQ to follow up${phone ? `, or call ${phone}` : ""}.`,
  });

  redirect(`/counsel/${churchSlug}/thank-you`);
}
