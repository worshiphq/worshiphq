"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { sendEmail } from "@/lib/integrations/email";
import { sendChurchSms } from "@/lib/sms/credits";
import { audit } from "@/lib/audit";
import type { Channel } from "@prisma/client";

interface Recipient {
  id: string | null;
  name: string;
  contact: string;
}

/** Adults (ageGroup null/adult, matching the rest of the app's "adult" filter)
 *  who have no Ghana Card / National ID on file - useful for a data-completeness
 *  drive campaign. */
const MISSING_NATIONAL_ID_ADULTS = {
  AND: [
    { OR: [{ ageGroup: null }, { ageGroup: "adult" }] },
    { OR: [{ nationalId: null }, { nationalId: "" }] },
  ],
};

/** Send (or stub-send) a broadcast and log it as a campaign. */
export async function sendBroadcast(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const name = String(formData.get("name") ?? "Broadcast").trim() || "Broadcast";
  const channel = (String(formData.get("channel") ?? "SMS") as Channel) || "SMS";
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return;

  // ── Resolve recipients by target ──
  // target: "all" | "active" | "visitor" | "leaders" | "group-leaders" |
  //         "missing-national-id" | "dept:<id>" | "custom"
  const target = String(formData.get("target") ?? "all");
  let recipientObjs: Recipient[] = [];
  let segmentLabel = "All members";

  const pick = (
    people: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null }[],
  ): Recipient[] =>
    people
      .map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        contact: channel === "Email" ? p.email : p.phone,
      }))
      .filter((r): r is { id: string; name: string; contact: string } => !!r.contact);

  const PERSON_SELECT = { id: true, firstName: true, lastName: true, phone: true, email: true } as const;

  if (target === "custom") {
    // Free-typed numbers/emails, separated by comma / space / newline.
    recipientObjs = String(formData.get("contacts") ?? "")
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((contact) => ({ id: null, name: "", contact }));
    segmentLabel = `${recipientObjs.length} custom recipient(s)`;
  } else if (target === "leaders") {
    // Church leadership team: anyone with a leadership title.
    const people = await db.person.findMany({
      where: { churchId: session.churchId, leaderTitle: { not: null } },
      select: PERSON_SELECT,
    });
    recipientObjs = pick(people);
    segmentLabel = "Church leaders";
  } else if (target === "group-leaders") {
    // The leader of every group/ministry (deduped - one person may lead several).
    const groups = await db.group.findMany({
      where: { churchId: session.churchId, leaderId: { not: null } },
      select: { leader: { select: PERSON_SELECT } },
    });
    const seen = new Set<string>();
    const leaders = groups
      .map((g) => g.leader)
      .filter((l): l is NonNullable<typeof l> => {
        if (!l || seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
      });
    recipientObjs = pick(leaders);
    segmentLabel = "Group / ministry leaders";
  } else if (target === "missing-national-id") {
    // Adults with no Ghana Card on file - a data-completeness drive.
    const people = await db.person.findMany({
      where: { churchId: session.churchId, ...MISSING_NATIONAL_ID_ADULTS },
      select: PERSON_SELECT,
    });
    recipientObjs = pick(people);
    segmentLabel = "Adults missing Ghana Card";
  } else {
    const where: { churchId: string; status?: "active" | "visitor"; departments?: { some: { id: string } } } = {
      churchId: session.churchId,
    };
    if (target === "active") { where.status = "active"; segmentLabel = "Active members"; }
    else if (target === "visitor") { where.status = "visitor"; segmentLabel = "Visitors"; }
    else if (target.startsWith("dept:")) {
      const id = target.slice(5);
      where.departments = { some: { id } };
      const dept = await db.department.findFirst({ where: { id, churchId: session.churchId }, select: { name: true } });
      segmentLabel = dept ? `${dept.name} department` : "Department";
    }
    const people = await db.person.findMany({ where, select: PERSON_SELECT });
    recipientObjs = pick(people);
  }

  const recipients = recipientObjs.map((r) => r.contact);
  let sent = recipients.length;
  // Per-recipient outcome for the audit log - defaults to "all succeeded"
  // (email / stub mode has no finer granularity than the whole-batch result).
  let statusByIndex: boolean[] = recipients.map(() => true);

  if (recipients.length) {
    if (channel === "Email") {
      const result = await sendEmail({ to: recipients, subject: name, html: `<p>${message}</p>` });
      statusByIndex = recipients.map(() => result.ok);
      sent = result.ok ? recipients.length : 0;
    } else {
      // SMS is billed against the church's prepaid credits.
      const result = await sendChurchSms(session.churchId, recipients, message, { note: name });
      if (result.insufficient) {
        redirect("/app/communications?error=credits");
      }
      sent = result.sent;
      statusByIndex = result.results ? result.results.map((r) => r.ok) : recipients.map(() => result.ok);
    }
  }

  const comm = await db.communication.create({
    data: {
      churchId: session.churchId,
      name,
      channel,
      body: message,
      segment: segmentLabel,
      sent,
      delivered: sent, // optimistic in stub mode
      status: "sent",
    },
  });

  if (recipientObjs.length) {
    await db.communicationRecipient.createMany({
      data: recipientObjs.map((r, i) => ({
        communicationId: comm.id,
        personId: r.id,
        name: r.name || null,
        contact: r.contact,
        status: statusByIndex[i] ? "sent" : "failed",
      })),
    });
  }

  await audit(session, "send", "broadcast", `Sent "${name}" to ${sent} recipient(s)`);
  revalidatePath("/app/communications");
  revalidatePath("/app");
}

/** Full per-recipient send audit for one campaign (who it went to, and whether
 *  each one actually went through). Scoped to the caller's own church. */
export async function getCampaignRecipients(communicationId: string) {
  const session = await requireSession();
  const comm = await db.communication.findFirst({
    where: { id: communicationId, churchId: session.churchId },
    select: { id: true },
  });
  if (!comm) return [];

  const rows = await db.communicationRecipient.findMany({
    where: { communicationId },
    orderBy: { createdAt: "asc" },
    select: { name: true, contact: true, status: true },
  });
  return rows;
}

/** Send an SMS to a single member from their profile. Billed to credits. */
export async function sendSmsToPerson(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const personId = String(formData.get("personId") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  if (!personId || !message) return;

  const person = await db.person.findFirst({
    where: { id: personId, churchId: session.churchId },
    select: { phone: true, firstName: true },
  });
  if (!person?.phone) {
    redirect("/app/people?sms=nophone");
  }

  const result = await sendChurchSms(session.churchId, person.phone, message, { note: `Direct: ${person.firstName}` });
  if (result.insufficient) {
    redirect("/app/people?sms=credits");
  }

  await db.communication.create({
    data: {
      churchId: session.churchId,
      name: `Direct SMS to ${person.firstName}`,
      channel: "SMS",
      body: message,
      segment: "Individual",
      sent: result.sent,
      delivered: result.sent,
      status: "sent",
    },
  });

  revalidatePath("/app/people");
}
