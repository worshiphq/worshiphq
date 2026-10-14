"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { notifyChurchAdmins } from "@/lib/notify/admins";
import { FORM_KINDS, collectExtraAnswers, TESTIMONY_CATEGORIES, COUNSEL_TYPES } from "@/lib/forms/kinds";

const TESTIMONY_KEYS: Record<string, string> = Object.fromEntries(TESTIMONY_CATEGORIES.filter((c) => c !== "Other").map((c) => [c, c === "Praise report" ? "praise" : c.toLowerCase()]));
const COUNSEL_KEYS: Record<string, string> = { "General / not sure": "general", "Marriage / family": "marriage", "Spiritual growth": "spiritual", "Grief / loss": "grief", Financial: "financial", Health: "health" };
void COUNSEL_TYPES;

/** Public: a member/visitor submits a testimony for the church to review. */
export async function submitPublicTestimony(formData: FormData) {
  const churchSlug = String(formData.get("churchSlug") ?? "").trim();
  if (!churchSlug) return;

  const church = await db.church.findUnique({
    where: { slug: churchSlug },
    select: { id: true, isDemo: true, testimonyFormFields: true },
  });
  if (!church || church.isDemo) return;

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return;

  const pickedCategory = String(formData.get("category") ?? "").trim();
  // The standard choices map to the app's own keys; anything the person typed under Other is kept as written.
  const category = !pickedCategory ? "praise" : TESTIMONY_KEYS[pickedCategory] ?? (pickedCategory === "Other" ? "other" : pickedCategory);
  const anonymous = formData.get("anonymous") === "yes" || formData.get("anonymous") === "on";
  const name = String(formData.get("name") ?? "").trim();
  const extra = collectExtraAnswers(FORM_KINDS.testimony.resolve(church.testimonyFormFields), (id) => formData.getAll(id).map(String));

  await db.testimony.create({
    data: {
      churchId: church.id,
      title,
      body: anonymous || !name ? body : `${body}\n\n- ${name}`,
      category,
      anonymous: anonymous || !name,
      status: "pending", // admin reviews before it's shared publicly
      ...(extra.length ? { extra } : {}),
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
    select: { id: true, isDemo: true, counselFormFields: true },
  });
  if (!church || church.isDemo) return;

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const pickedType = String(formData.get("type") ?? "").trim().slice(0, 60);
  const type = !pickedType ? "general" : COUNSEL_KEYS[pickedType] ?? (pickedType === "Other" ? "other" : pickedType);
  const extra = collectExtraAnswers(FORM_KINDS.counsel.resolve(church.counselFormFields), (id) => formData.getAll(id).map(String));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;

  await db.counselingSession.create({
    data: {
      churchId: church.id,
      summary: `[Request] ${reason}`,
      counseleeName: name ? name.slice(0, 120) : null,
      counseleePhone: phone || null,
      ...(extra.length ? { extra } : {}),
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
