"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { sendEmail } from "@/lib/integrations/email";
import { sendChurchSms } from "@/lib/sms/credits";
import { audit } from "@/lib/audit";
import type { Channel } from "@prisma/client";

/** Send (or stub-send) a broadcast and log it as a campaign. */
export async function sendBroadcast(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const name = String(formData.get("name") ?? "Broadcast").trim() || "Broadcast";
  const channel = (String(formData.get("channel") ?? "SMS") as Channel) || "SMS";
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return;

  // ── Resolve recipients by target ──
  // target: "all" | "active" | "visitor" | "leaders" | "group-leaders" | "dept:<id>" | "custom"
  const target = String(formData.get("target") ?? "all");
  let recipients: string[] = [];
  let segmentLabel = "All members";

  const pick = (people: { phone: string | null; email: string | null }[]) =>
    channel === "Email"
      ? people.map((p) => p.email).filter((e): e is string => !!e)
      : people.map((p) => p.phone).filter((p): p is string => !!p);

  if (target === "custom") {
    // Free-typed numbers/emails, separated by comma / space / newline.
    recipients = String(formData.get("contacts") ?? "")
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    segmentLabel = `${recipients.length} custom recipient(s)`;
  } else if (target === "leaders") {
    // Church leadership team: anyone with a leadership title.
    const people = await db.person.findMany({
      where: { churchId: session.churchId, leaderTitle: { not: null } },
      select: { phone: true, email: true },
    });
    recipients = pick(people);
    segmentLabel = "Church leaders";
  } else if (target === "group-leaders") {
    // The leader of every group/ministry (deduped — one person may lead several).
    const groups = await db.group.findMany({
      where: { churchId: session.churchId, leaderId: { not: null } },
      select: { leader: { select: { id: true, phone: true, email: true } } },
    });
    const seen = new Set<string>();
    const leaders = groups
      .map((g) => g.leader)
      .filter((l): l is { id: string; phone: string | null; email: string | null } => {
        if (!l || seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
      });
    recipients = pick(leaders);
    segmentLabel = "Group / ministry leaders";
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
    const people = await db.person.findMany({ where, select: { phone: true, email: true } });
    recipients = pick(people);
  }

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
      segment: segmentLabel,
      sent,
      delivered: sent, // optimistic in stub mode
      status: "sent",
    },
  });

  await audit(session, "send", "broadcast", `Sent "${name}" to ${sent} recipient(s)`);
  revalidatePath("/app/communications");
  revalidatePath("/app");
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
