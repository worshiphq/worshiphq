"use server";

import { revalidatePath } from "next/cache";
import { requireModule, requireManage } from "@/lib/auth";
import { db } from "@/lib/db";
import { moveToBin } from "@/lib/recycle-bin";
import { segmentsFor } from "@/config/sms";
import { sendChurchSms } from "@/lib/sms/credits";
import { resolveAudience } from "@/lib/sms/audience";

/** Build the SMS text for a devotional (trimmed to keep segments sane). */
function devotionalSms(d: { title: string; scripture: string | null; body: string }, churchName: string): string {
  const head = `📖 ${d.title}${d.scripture ? ` (${d.scripture})` : ""}`;
  const body = d.body.length > 600 ? `${d.body.slice(0, 597)}…` : d.body;
  return `${head}\n\n${body}\n\n- ${churchName}`;
}

/** Preview the text, audience and cost of texting a devotional before sending. */
export async function previewDevotionalBlast(id: string, audience = "all", customMessage?: string, personIds: string[] = []) {
  const session = await requireModule("devotionals");
  const [dev, church, aud] = await Promise.all([
    db.devotional.findFirst({ where: { id, churchId: session.churchId }, select: { title: true, scripture: true, body: true } }),
    db.church.findUnique({ where: { id: session.churchId }, select: { name: true, smsCredits: true } }),
    resolveAudience(session.churchId, audience, personIds),
  ]);
  if (!dev) return { ok: false as const, error: "Devotional not found." };

  const message = (customMessage ?? "").trim() || devotionalSms(dev, church?.name ?? "your church");
  const recipients = aud.recipients.length;
  const perMessage = segmentsFor(message);
  const cost = perMessage * recipients;
  const balance = church?.smsCredits ?? 0;
  return {
    ok: true as const,
    message,
    audienceLabel: aud.label,
    recipients,
    segmentsEach: perMessage,
    cost,
    balance,
    remaining: balance - cost,
    enough: balance >= cost,
  };
}

/** Text a devotional to the chosen part of the congregation. */
export async function blastDevotional(id: string, audience = "all", customMessage?: string, personIds: string[] = []) {
  const session = await requireManage("devotionals");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };

  const [dev, church, aud] = await Promise.all([
    db.devotional.findFirst({ where: { id, churchId: session.churchId }, select: { title: true, scripture: true, body: true } }),
    db.church.findUnique({ where: { id: session.churchId }, select: { name: true } }),
    resolveAudience(session.churchId, audience, personIds),
  ]);
  if (!dev) return { ok: false as const, error: "Devotional not found." };
  const phones = aud.recipients.map((m) => m.phone!).filter(Boolean);
  if (phones.length === 0) return { ok: false as const, error: "Nobody in that group has a phone number on file." };

  const text = (customMessage ?? "").trim().slice(0, 1200) || devotionalSms(dev, church?.name ?? "your church");
  const res = await sendChurchSms(session.churchId, phones, text, { note: `Devotional: ${dev.title}` });
  if (!res.ok && res.insufficient) {
    return { ok: false as const, error: `Not enough SMS credits - need ${res.cost}, have ${res.balance}. Top up and try again.` };
  }

  // Show up under Communications like any other campaign.
  await db.communication.create({
    data: {
      churchId: session.churchId,
      name: `Devotional: ${dev.title}`,
      channel: "SMS",
      body: text,
      segment: aud.label,
      sent: res.sent,
      delivered: res.sent,
      status: "sent",
    },
  });

  const { audit } = await import("@/lib/audit");
  await audit(session, "send", "devotional", `Texted devotional "${dev.title}" to ${res.sent} member(s) (${aud.label})`);
  revalidatePath("/app/devotionals");
  revalidatePath("/app/communications");
  return { ok: true as const, sent: res.sent, audienceLabel: aud.label };
}

/** Create or update a devotional (the editor page saves through this). */
export async function saveDevotional(input: {
  id?: string; title: string; scripture: string; author: string; date: string; body: string; published: boolean;
}) {
  const session = await requireManage("devotionals");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { ok: false as const, error: "Give the devotional a title." };
  if (!body) return { ok: false as const, error: "Write the devotional first." };
  const data = {
    title,
    body,
    scripture: input.scripture.trim() || null,
    author: input.author.trim() || null,
    published: input.published,
    ...(input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? { date: new Date(`${input.date}T12:00:00`) } : {}),
  };

  let id = input.id;
  if (id) {
    const res = await db.devotional.updateMany({ where: { id, churchId: session.churchId }, data });
    if (res.count === 0) return { ok: false as const, error: "Devotional not found." };
  } else {
    const created = await db.devotional.create({ data: { churchId: session.churchId, ...data } });
    id = created.id;
  }
  const { audit } = await import("@/lib/audit");
  await audit(session, input.id ? "update" : "create", "devotional", `${input.id ? "Updated" : "Added"} devotional "${title}"`, id);
  revalidatePath("/app/devotionals");
  return { ok: true as const, id };
}

export async function createDevotional(formData: FormData) {
  const session = await requireManage("devotionals");
  if (session.isDemo) return;

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return;

  const scripture = String(formData.get("scripture") ?? "").trim() || null;
  const author = String(formData.get("author") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "").trim();

  await db.devotional.create({
    data: {
      churchId: session.churchId,
      title,
      body,
      scripture,
      author,
      ...(dateStr ? { date: new Date(dateStr) } : {}),
    },
  });

  revalidatePath("/app/devotionals");
}

export async function deleteDevotional(formData: FormData) {
  const session = await requireManage("devotionals");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  await moveToBin(session, "devotional", "Devotional", id);
  await db.devotional.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/devotionals");
}

export async function toggleDevotionalPublished(formData: FormData) {
  const session = await requireManage("devotionals");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const d = await db.devotional.findFirst({ where: { id, churchId: session.churchId }, select: { published: true } });
  if (!d) return;
  await db.devotional.update({ where: { id }, data: { published: !d.published } });
  revalidatePath("/app/devotionals");
}
