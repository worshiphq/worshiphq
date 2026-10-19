import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/integrations/email";
import { sendSms } from "@/lib/integrations/sms";
import { firstName, mergeFields, renderEmailHtml, templateById, type OutreachChannel } from "@/lib/outreach/templates";

/** Replies to our emails and the contact shown in them: the platform owner's inbox. */
export const outreachContact = () => env.SUPERADMIN_EMAIL;

export type OutreachStatus = "sent" | "failed" | "stubbed";
export type OutreachResult = { ok: boolean; status: OutreachStatus; error?: string; skipped?: boolean };

type SendInput = {
  churchId: string;
  userId: string;
  channel: OutreachChannel;
  template: string;
  /** Leave out to use the template's own wording. */
  subject?: string;
  body?: string;
  auto?: boolean;
};

/** Send one email or text to one church contact and keep a record of it. */
export async function sendOutreach(input: SendInput): Promise<OutreachResult> {
  const [church, user] = await Promise.all([
    db.church.findUnique({ where: { id: input.churchId }, select: { id: true, name: true } }),
    db.user.findFirst({ where: { id: input.userId, churchId: input.churchId }, select: { id: true, name: true, email: true, phone: true } }),
  ]);
  if (!church || !user) return { ok: false, status: "failed", error: "That contact was not found." };

  const tpl = templateById(input.template);
  const contact = outreachContact();
  const merge = { name: firstName(user.name), church: church.name, contact };
  const subject = mergeFields(input.subject ?? tpl?.subject ?? "A message from WorshipHQ", merge).trim();
  const body = mergeFields(input.body ?? tpl?.body ?? "", merge).trim();
  if (!body) return { ok: false, status: "failed", error: "The message is empty." };

  let status: OutreachStatus;
  let error: string | undefined;
  let to: string;

  if (input.channel === "email") {
    to = user.email;
    if (!to) return { ok: false, status: "failed", error: "This contact has no email address." };
    if (!subject) return { ok: false, status: "failed", error: "Add a subject." };
    const r = await sendEmail({ to, subject, html: renderEmailHtml({ subject, body, church: church.name, contact }), replyTo: contact });
    status = r.stubbed ? "stubbed" : r.ok ? "sent" : "failed";
    if (!r.ok) error = r.error ?? "The email provider refused it.";
  } else {
    to = user.phone ?? "";
    if (!to) return { ok: false, status: "failed", error: "This contact has no phone number." };
    const r = await sendSms(to, body, { heading: null });
    status = r.stubbed ? "stubbed" : r.ok ? "sent" : "failed";
    if (!r.ok) error = r.error ?? "The SMS provider refused it.";
  }

  await db.outreachMessage.create({
    data: { churchId: church.id, userId: user.id, toName: user.name, to, channel: input.channel, template: input.template, subject: input.channel === "email" ? subject : null, body, status, error: error ?? null, auto: !!input.auto },
  });
  return { ok: status !== "failed", status, error };
}

/** Has this church already been sent the welcome email? Only a real delivery counts, never a test (stubbed) or failed send. */
export async function hasWelcome(churchId: string): Promise<boolean> {
  const n = await db.outreachMessage.count({ where: { churchId, channel: "email", template: "welcome", status: "sent" } });
  return n > 0;
}

/** The welcome email to a church's owner. Sent once only, and never to the demo church. */
export async function sendWelcome(churchId: string, auto: boolean): Promise<OutreachResult> {
  const church = await db.church.findUnique({ where: { id: churchId }, select: { isDemo: true } });
  if (!church || church.isDemo) return { ok: true, status: "stubbed", skipped: true };
  if (await hasWelcome(churchId)) return { ok: true, status: "sent", skipped: true };
  const owner = await db.user.findFirst({ where: { churchId, role: "Owner" }, orderBy: { createdAt: "asc" }, select: { id: true } })
    ?? await db.user.findFirst({ where: { churchId, role: "Admin" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!owner) return { ok: false, status: "failed", error: "This church has no owner or admin." };
  return sendOutreach({ churchId, userId: owner.id, channel: "email", template: "welcome", auto });
}
