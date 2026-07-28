"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { segmentsFor } from "@/config/sms";
import { sendChurchSms } from "@/lib/sms/credits";

/** Build the SMS text for a devotional (trimmed to keep segments sane). */
function devotionalSms(d: { title: string; scripture: string | null; body: string }, churchName: string): string {
  const head = `📖 ${d.title}${d.scripture ? ` (${d.scripture})` : ""}`;
  const body = d.body.length > 600 ? `${d.body.slice(0, 597)}…` : d.body;
  return `${head}\n\n${body}\n\n— ${churchName}`;
}

/** Preview what a devotional SMS blast will cost before sending. */
export async function previewDevotionalBlast(id: string) {
  const session = await requireModule("communications");
  const [dev, members, church] = await Promise.all([
    db.devotional.findFirst({ where: { id, churchId: session.churchId }, select: { title: true, scripture: true, body: true } }),
    db.person.findMany({ where: { churchId: session.churchId, status: { not: "inactive" }, phone: { not: null } }, select: { id: true } }),
    db.church.findUnique({ where: { id: session.churchId }, select: { name: true, smsCredits: true } }),
  ]);
  if (!dev) return { ok: false as const, error: "Devotional not found." };

  const recipients = members.length;
  const perMessage = segmentsFor(devotionalSms(dev, church?.name ?? "your church"));
  const cost = perMessage * recipients;
  const balance = church?.smsCredits ?? 0;
  return {
    ok: true as const,
    recipients,
    segmentsEach: perMessage,
    cost,
    balance,
    remaining: balance - cost,
    enough: balance >= cost,
  };
}

/** Send a devotional by SMS to every active member with a phone. */
export async function blastDevotional(id: string) {
  const session = await requireModule("communications");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };

  const [dev, members, church] = await Promise.all([
    db.devotional.findFirst({ where: { id, churchId: session.churchId }, select: { title: true, scripture: true, body: true } }),
    db.person.findMany({ where: { churchId: session.churchId, status: { not: "inactive" }, phone: { not: null } }, select: { phone: true } }),
    db.church.findUnique({ where: { id: session.churchId }, select: { name: true } }),
  ]);
  if (!dev) return { ok: false as const, error: "Devotional not found." };
  const phones = members.map((m) => m.phone!).filter(Boolean);
  if (phones.length === 0) return { ok: false as const, error: "No members with phone numbers to send to." };

  const text = devotionalSms(dev, church?.name ?? "your church");
  const res = await sendChurchSms(session.churchId, phones, text, { note: `Devotional: ${dev.title}` });
  if (!res.ok && res.insufficient) {
    return { ok: false as const, error: `Not enough SMS credits — need ${res.cost}, have ${res.balance}. Top up and try again.` };
  }
  const { audit } = await import("@/lib/audit");
  await audit(session, "send", "devotional", `Sent devotional "${dev.title}" to ${res.sent} member(s)`);
  revalidatePath("/app/devotionals");
  return { ok: true as const, sent: res.sent };
}

export async function createDevotional(formData: FormData) {
  const session = await requireModule("communications");
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
  const session = await requireModule("communications");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  await db.devotional.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/devotionals");
}

export async function toggleDevotionalPublished(formData: FormData) {
  const session = await requireModule("communications");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const d = await db.devotional.findFirst({ where: { id, churchId: session.churchId }, select: { published: true } });
  if (!d) return;
  await db.devotional.update({ where: { id }, data: { published: !d.published } });
  revalidatePath("/app/devotionals");
}
