"use server";

import { revalidatePath } from "next/cache";
import { requireManage, assertCanWrite, assertPlanFeature } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { normalizeBriefing, type BriefingSettings } from "@/lib/briefing/settings";
import { buildBriefing, deliverBriefing } from "@/lib/briefing/briefing";

/** Save who gets the Monday briefing, when, and how. Max plan. */
export async function saveBriefing(input: BriefingSettings) {
  const session = await requireManage("reminders");
  assertCanWrite(session, "reminders");
  assertPlanFeature(session, "weekly-briefing");
  const next = normalizeBriefing(input);
  if (next.userIds.length) {
    const ok = new Set((await db.user.findMany({ where: { churchId: session.churchId, id: { in: next.userIds } }, select: { id: true } })).map((u) => u.id));
    next.userIds = next.userIds.filter((id) => ok.has(id));
  }
  await db.church.update({ where: { id: session.churchId }, data: { briefing: next } });
  await audit(session, "update", "settings", next.on ? "Turned on the Monday briefing" : "Turned off the Monday briefing", session.churchId);
  revalidatePath("/app/reminders");
  return { ok: true as const };
}

/** Send this week's briefing to yourself now (email only, so it never spends SMS credits). */
export async function sendBriefingPreview() {
  const session = await requireManage("reminders");
  assertCanWrite(session, "reminders");
  assertPlanFeature(session, "weekly-briefing");
  const me = session.userId ? await db.user.findUnique({ where: { id: session.userId }, select: { email: true } }) : null;
  if (!me?.email || me.email.endsWith("@invite.worshiphq.app")) return { ok: false as const, error: "Your account has no email address to send the preview to." };
  const b = await buildBriefing(session.churchId);
  if (!b) return { ok: false as const, error: "Could not build the briefing." };
  const r = await deliverBriefing(session.churchId, b, { emails: [me.email], phones: [] });
  return r.emails ? { ok: true as const, message: `Sent to ${me.email}.` } : { ok: false as const, error: "The email could not be sent. Try again in a moment." };
}
