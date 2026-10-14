"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { sendChurchSms } from "@/lib/sms/credits";

const PER_DAY = 3;
const MAX_PEOPLE = 300;

/** Switch on or off group leaders texting their own group. */
export async function setLeaderMessaging(on: boolean) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  await db.church.update({ where: { id: session.churchId }, data: { leaderMessagingOn: !!on } });
  await audit(session, "update", "settings", on ? "Let group leaders text their own group" : "Stopped group leaders texting their group");
  revalidatePath("/app/communications/credits");
  revalidatePath("/app/groups");
  return { ok: true as const };
}

/**
 * A group's leader texts their own group. It goes out from the church's one sender ID, with the group name at the
 * front and the leader's name at the end, so members know which group is checking in on them. The church pays in
 * credits, so it is off until the church switches it on, and a leader may send only a few a day per group.
 */
export async function sendLeaderGroupMessage(input: { groupId: string; message: string }): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const session = await requireSession();
  if (session.isDemo) return { ok: false, error: "Read-only demo." };
  const text = String(input.message ?? "").trim().slice(0, 600);
  if (!text) return { ok: false, error: "Write your message first." };

  const [group, church, me] = await Promise.all([
    db.group.findFirst({ where: { id: input.groupId, churchId: session.churchId }, select: { id: true, name: true, leaderId: true, leader: { select: { firstName: true } } } }),
    db.church.findUnique({ where: { id: session.churchId }, select: { leaderMessagingOn: true } }),
    db.user.findUnique({ where: { id: session.userId }, select: { personId: true } }),
  ]);
  if (!group) return { ok: false, error: "Group not found." };
  const manager = canEdit(session, "communications");
  const leads = !!me?.personId && me.personId === group.leaderId;
  if (!manager && !(church?.leaderMessagingOn && leads)) return { ok: false, error: "Only the leader of this group can message it, and only when your church has allowed it." };

  const label = `${group.name} message`;
  if (!manager) {
    const since = new Date(Date.now() - 24 * 3600_000);
    const today = await db.communication.count({ where: { churchId: session.churchId, name: label, createdAt: { gte: since } } });
    if (today >= PER_DAY) return { ok: false, error: `You can send ${PER_DAY} messages a day to this group. Please try again tomorrow, or ask an admin.` };
  }

  const people = await db.person.findMany({
    where: { churchId: session.churchId, groups: { some: { id: group.id } }, status: { not: "inactive" }, phone: { not: null } },
    select: { id: true, firstName: true, lastName: true, phone: true },
    take: MAX_PEOPLE,
  });
  if (people.length === 0) return { ok: false, error: "Nobody in this group has a phone number on file." };

  const sign = group.leader?.firstName ? `\n- ${group.leader.firstName}` : "";
  const personalise = text.includes("{name}");
  const outBase = `${group.name}: ${text}${sign}`;
  let sent = 0;
  let broke = false;
  const outcome: boolean[] = [];
  if (personalise) {
    for (const p of people) {
      const r = await sendChurchSms(session.churchId, p.phone!, outBase.replace(/\{name\}/g, p.firstName || "there"), { note: label });
      if (r.insufficient) { broke = true; break; }
      outcome.push(r.ok);
    }
    sent = outcome.filter(Boolean).length;
  } else {
    const r = await sendChurchSms(session.churchId, people.map((p) => p.phone!), outBase, { note: label });
    if (r.insufficient) broke = true;
    sent = r.sent;
    people.forEach((_, i) => outcome.push(r.results ? !!r.results[i]?.ok : r.ok));
  }
  if (sent === 0) return { ok: false, error: broke ? "Your church is out of SMS credits. Please ask an admin to top up." : "The message could not be sent." };

  const comm = await db.communication.create({
    data: { churchId: session.churchId, name: label, channel: "SMS", body: text, segment: `${group.name} group (by its leader)`, sent, delivered: sent, status: "sent" },
  });
  await db.communicationRecipient.createMany({
    data: people.map((p, i) => ({ communicationId: comm.id, personId: p.id, name: `${p.firstName} ${p.lastName}`.trim() || null, contact: p.phone!, status: outcome[i] ? "sent" : "failed" })),
  });
  await audit(session, "send", "broadcast", `Group leader sent "${label}" to ${sent} member(s)`);
  revalidatePath("/app/communications");
  return { ok: true, sent };
}
