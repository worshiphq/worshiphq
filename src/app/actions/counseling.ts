"use server";

import { revalidatePath } from "next/cache";
import { requireModule, requireManage } from "@/lib/auth";
import { db } from "@/lib/db";
import { moveToBin } from "@/lib/recycle-bin";
import { logAudit } from "@/lib/audit";
import { isValidPhone } from "@/lib/phone";
import { zonedToUtc } from "@/lib/time/tz";
import { counselingDraft, sendCounselingText, type CounselingTextKind } from "@/lib/counseling/text";

export async function createCounselingSession(formData: FormData) {
  const session = await requireManage("counseling");
  if (session.isDemo) return;

  let summary = String(formData.get("summary") ?? "").trim();
  if (!summary) return;

  const type = String(formData.get("type") ?? "general").trim();
  const personId = String(formData.get("personId") ?? "").trim() || null;
  // For a visitor / non-member, capture the typed name in the summary.
  const counseleeName = String(formData.get("counseleeName") ?? "").trim();
  if (!personId && counseleeName) summary = `[${counseleeName}] ${summary}`;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "open").trim();
  const confidential = formData.get("confidential") !== "off";
  const dateStr = String(formData.get("date") ?? "").trim();
  const followUpStr = String(formData.get("followUpDate") ?? "").trim();

  const cs = await db.counselingSession.create({
    data: {
      churchId: session.churchId,
      summary,
      type,
      personId,
      counselorId: session.userId === "demo" || session.userId === "superadmin" ? null : session.userId,
      notes,
      status,
      confidential,
      ...(dateStr ? { date: new Date(dateStr) } : {}),
      ...(followUpStr ? { followUpDate: new Date(followUpStr) } : {}),
    },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "counseling", entityId: cs.id, detail: `Added counseling session (${type})` });

  const { notifyChurchAdmins } = await import("@/lib/notify/admins");
  await notifyChurchAdmins(session.churchId, {
    subject: "New counselling request",
    sms: `🤝 A new counselling request (${type}) has been logged at your church. Open WorshipHQ to follow up.`,
  });

  revalidatePath("/app/counseling");
}

export async function deleteCounselingSession(formData: FormData) {
  const session = await requireManage("counseling");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  await moveToBin(session, "counselingSession", "CounselingSession", id, { label: "Counselling session" });
  await db.counselingSession.deleteMany({ where: { id, churchId: session.churchId } });
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "counseling", entityId: id, detail: "Deleted counseling session" });
  revalidatePath("/app/counseling");
}

export async function updateCounselingStatus(formData: FormData) {
  const session = await requireManage("counseling");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  await db.counselingSession.updateMany({ where: { id, churchId: session.churchId }, data: { status } });
  revalidatePath("/app/counseling");
}

const DAY = 86400000;

export type CounselingInput = {
  id?: string;
  type: string;
  personId: string;
  counseleeName: string;
  counseleePhone: string;
  counselorId: string;
  date: string;
  scheduledDate: string;
  scheduledTime: string;
  followUpDate: string;
  summary: string;
  notes: string;
  status: string;
  confidential: boolean;
  textUpdates: boolean;
  /** Text the person about this booking / change right now. */
  notify: boolean;
};

const ymd = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

/** Create or update a counselling session, and text the person if asked. */
export async function saveCounselingSession(input: CounselingInput) {
  const session = await requireManage("counseling");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };

  const summary = input.summary.trim();
  if (!summary) return { ok: false as const, error: "Add a short summary of the session." };

  const phone = input.counseleePhone.trim();
  if (phone && !isValidPhone(phone)) return { ok: false as const, error: "That phone number does not look right." };

  const church = await db.church.findUnique({ where: { id: session.churchId }, select: { timezone: true } });
  const tz = church?.timezone ?? "Africa/Accra";

  const person = input.personId
    ? await db.person.findFirst({ where: { id: input.personId, churchId: session.churchId }, select: { id: true } })
    : null;
  const counselor = input.counselorId
    ? await db.user.findFirst({ where: { id: input.counselorId, churchId: session.churchId }, select: { id: true } })
    : null;

  const sd = ymd(input.scheduledDate);
  const scheduledAt = sd ? zonedToUtc(sd, /^\d{2}:\d{2}$/.test(input.scheduledTime) ? input.scheduledTime : "09:00", tz) : null;
  const status = ["open", "follow-up", "closed"].includes(input.status) ? input.status : "open";

  const data = {
    type: input.type.trim().slice(0, 60) || "general",
    summary,
    notes: input.notes.trim() || null,
    status,
    confidential: input.confidential,
    personId: person?.id ?? null,
    counseleeName: person ? null : input.counseleeName.trim().slice(0, 120) || null,
    counseleePhone: phone || null,
    counselorId: counselor?.id ?? null,
    scheduledAt,
    textUpdates: input.textUpdates,
    followUpDate: ymd(input.followUpDate) ? new Date(`${ymd(input.followUpDate)}T12:00:00`) : null,
    ...(ymd(input.date) ? { date: new Date(`${ymd(input.date)}T12:00:00`) } : {}),
  };

  const now = Date.now();
  // A reminder is only worth sending when the appointment is more than a day away.
  const needsReminder = !!scheduledAt && scheduledAt.getTime() - now > DAY;

  let id = input.id;
  let before: { scheduledAt: Date | null; counselorId: string | null } | null = null;
  if (id) {
    before = await db.counselingSession.findFirst({ where: { id, churchId: session.churchId }, select: { scheduledAt: true, counselorId: true } });
    if (!before) return { ok: false as const, error: "Session not found." };
    const changed = before.scheduledAt?.getTime() !== scheduledAt?.getTime() || before.counselorId !== (counselor?.id ?? null);
    await db.counselingSession.update({
      where: { id },
      data: { ...data, ...(changed ? { reminderSentAt: needsReminder ? null : scheduledAt ? new Date() : null } : {}) },
    });
  } else {
    const created = await db.counselingSession.create({
      data: { churchId: session.churchId, ...data, reminderSentAt: scheduledAt && !needsReminder ? new Date() : null },
    });
    id = created.id;
  }

  await logAudit({
    churchId: session.churchId, userId: session.userId, action: input.id ? "update" : "create", entity: "counseling",
    entityId: id, detail: `${input.id ? "Updated" : "Added"} counseling session (${data.type})`,
  });

  if (!input.id) {
    const { notifyChurchAdmins } = await import("@/lib/notify/admins");
    await notifyChurchAdmins(session.churchId, {
      subject: "New counselling session",
      sms: `A new counselling session (${data.type}) has been logged at your church. Open WorshipHQ to follow up.`,
    });
  }

  // Text the person about the booking, or about a change to it.
  let texted: string | null = null;
  let textError: string | null = null;
  const changedTime = before ? before.scheduledAt?.getTime() !== scheduledAt?.getTime() || before.counselorId !== (counselor?.id ?? null) : true;
  if (input.notify && input.textUpdates && scheduledAt && scheduledAt.getTime() > now && changedTime) {
    const kind: CounselingTextKind = before?.scheduledAt ? "update" : "scheduled";
    const res = await sendCounselingText({ churchId: session.churchId, sessionId: id!, kind, sentBy: session.name || "Team member" });
    if (res.ok) texted = res.to; else textError = res.error;
  }

  revalidatePath("/app/counseling");
  return { ok: true as const, id: id!, texted, textError };
}

/** The wording of a text, ready to review before it is sent. */
export async function counselingTextDraft(id: string, kind: CounselingTextKind) {
  const session = await requireModule("counseling");
  const draft = await counselingDraft(session.churchId, id, kind);
  if (!draft) return { ok: false as const, error: "Session not found." };
  return { ok: true as const, to: draft.to, message: draft.message };
}

/** Send a reminder, an update, or your own words to the person. */
export async function sendCounselingTextNow(id: string, kind: CounselingTextKind, message?: string) {
  const session = await requireManage("counseling");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const res = await sendCounselingText({ churchId: session.churchId, sessionId: id, kind, sentBy: session.name || "Team member", message });
  if (!res.ok) return res;
  if (kind === "reminder") await db.counselingSession.updateMany({ where: { id, churchId: session.churchId }, data: { reminderSentAt: new Date() } });
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "update", entity: "counseling", entityId: id, detail: `Texted a counselling ${kind}` });
  revalidatePath("/app/counseling");
  return { ok: true as const, to: res.to };
}

/** Texts already sent about one session. */
export async function counselingMessages(id: string) {
  const session = await requireModule("counseling");
  const rows = await db.counselingMessage.findMany({
    where: { sessionId: id, churchId: session.churchId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, kind: true, body: true, sentTo: true, sentBy: true, createdAt: true },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
