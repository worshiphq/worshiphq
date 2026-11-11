"use server";

import { revalidatePath } from "next/cache";
import { requireModule, requireManage, assertCanWrite, assertPlanFeature, planLockFor } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { listAbsentees, confirmAbsentees, type AbsenteeFilters } from "@/lib/attendance/absentees";
import { notifyFollowUpAssignee } from "@/lib/follow-ups/notify";
import { sendChurchSms } from "@/lib/sms/credits";
import { renderTemplate } from "@/lib/messages/registry";

/** One page of a service's absentees, searched and filtered on the server. */
export async function loadAbsentees(sessionId: string, filters: AbsenteeFilters, page: number) {
  const session = await requireModule("attendance");
  if (planLockFor(session, "follow-ups")) return { ok: false as const, error: "Follow-ups are part of the Starter plan." };
  const res = await listAbsentees(session.churchId, sessionId, {
    q: String(filters.q ?? "").slice(0, 80),
    grouping: filters.grouping ? String(filters.grouping) : undefined,
    groupId: filters.groupId ? String(filters.groupId) : undefined,
    regularsOnly: filters.regularsOnly !== false,
  }, Math.max(1, Math.trunc(page) || 1));
  if (!res) return { ok: false as const, error: "Service not found." };
  return { ok: true as const, ...res };
}

export type AbsenteeAssign = {
  sessionId: string;
  personIds: string[];
  /** Person id -> team member user id. People not in the map get `defaultUserId` (or nobody). */
  perPerson: Record<string, string>;
  defaultUserId?: string;
  dueDays?: number;
  /** When set, text each person who has a phone. Placeholders: {name} {church} {service}. */
  smsText?: string;
};

/** Turn the chosen absentees into follow-ups (one each), optionally texting them a quiet check-in. */
export async function followUpAbsentees(input: AbsenteeAssign) {
  const session = await requireManage("follow-ups");
  assertCanWrite(session, "follow-ups");
  const ids = [...new Set(input.personIds.map(String))].slice(0, 2000);
  if (ids.length === 0) return { ok: false as const, error: "Choose at least one person." };
  const smsText = (input.smsText ?? "").trim().slice(0, 640);
  if (smsText) assertPlanFeature(session, "sms");

  const found = await confirmAbsentees(session.churchId, input.sessionId, ids);
  if (!found) return { ok: false as const, error: "Service not found." };
  const { sess, people } = found;

  const wanted = [...new Set([input.defaultUserId, ...Object.values(input.perPerson ?? {})].filter(Boolean) as string[])];
  const okUsers = new Set((await db.user.findMany({ where: { churchId: session.churchId, id: { in: wanted } }, select: { id: true } })).map((u) => u.id));
  const def = input.defaultUserId && okUsers.has(input.defaultUserId) ? input.defaultUserId : null;

  const days = Math.min(30, Math.max(1, Math.trunc(input.dueDays ?? 3)));
  const dueDate = new Date(Date.now() + days * 86400000);
  const when = sess.date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const title = (name: string) => `Missed ${sess.serviceName} (${when}): check on ${name}`;
  const note = `Was not at ${sess.serviceName} on ${when}. Please reach out, listen, and record what you find.`;

  let created = 0;
  const perAssignee = new Map<string, string[]>();
  for (const p of people) {
    const name = `${p.firstName} ${p.lastName}`.trim();
    const pick = input.perPerson?.[p.id];
    const userId = pick && okUsers.has(pick) ? pick : def;
    const fu = await db.followUp.create({
      data: {
        churchId: session.churchId, personId: p.id, type: "pastoral", title: title(name), note, dueDate,
        assigneeId: userId,
        ...(userId ? { assignees: { create: [{ userId }] } } : {}),
      },
      select: { id: true },
    });
    created++;
    if (userId) perAssignee.set(userId, [...(perAssignee.get(userId) ?? []), name]);
    void fu;
  }
  // One notice per team member, not one per person (20 absentees must not mean 20 texts to one leader).
  for (const [userId, names] of perAssignee) {
    const shown = names.slice(0, 6).join(", ") + (names.length > 6 ? ` and ${names.length - 6} more` : "");
    await notifyFollowUpAssignee({
      churchId: session.churchId, assigneeId: userId,
      title: names.length === 1 ? title(names[0]) : `Check on ${names.length} people who missed ${sess.serviceName} (${when})`,
      note: names.length === 1 ? note : `${shown}. See Follow-ups for the list.`, dueDate,
    }).catch(() => {});
  }

  let texted = 0, noPhone = 0, insufficient = false;
  if (smsText && !session.isDemo) {
    const church = await db.church.findUnique({ where: { id: session.churchId }, select: { name: true } });
    const withPhone = people.filter((p) => !!p.phone);
    noPhone = people.length - withPhone.length;
    if (withPhone.length) {
      // One send with a personal text each, so a long list never runs out of time half way.
      const res = await sendChurchSms(session.churchId, withPhone.map((p) => p.phone!), smsText, {
        note: "We missed you (absentee check-in)",
        textFor: (i) => renderTemplate(smsText, { name: withPhone[i]!.firstName, church: church?.name ?? "", service: sess.serviceName }),
      });
      insufficient = !!res.insufficient;
      texted = res.sent;
    }
  }

  await audit(session, "create", "follow-up", `Followed up ${created} absentee${created === 1 ? "" : "s"} from ${sess.serviceName} (${when})${texted ? `, texted ${texted}` : ""}`, sess.id);
  revalidatePath("/app/follow-ups");
  revalidatePath(`/app/attendance/${sess.id}`);
  revalidatePath("/app");
  const skipped = ids.length - people.length;
  return { ok: true as const, created, texted, noPhone, insufficient, skipped };
}
