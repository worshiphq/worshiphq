"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { categoryForPerson, type AttendanceCategory } from "@/lib/data/attendance";

const CATEGORY_FIELD: Record<AttendanceCategory, "adults" | "teens" | "children" | "visitors"> = {
  adult: "adults",
  teen: "teens",
  child: "children",
  visitor: "visitors",
};

/** Create a service session with demographic headcounts. */
export async function recordService(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const serviceName = String(formData.get("serviceName") ?? "Service").trim() || "Service";
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const adults = clamp(formData.get("adults"));
  const teens = clamp(formData.get("teens"));
  const children = clamp(formData.get("children"));
  const visitors = clamp(formData.get("visitors"));

  await db.attendanceSession.create({
    data: {
      churchId: session.churchId,
      branchId: session.branchId ?? undefined,
      serviceName,
      date: isNaN(date.getTime()) ? new Date() : date,
      adults,
      teens,
      children,
      visitors,
    },
  });

  revalidatePath("/app/attendance");
  revalidatePath("/app");
}

/** Create a fresh session for today and jump straight into its check-in screen. */
export async function startCheckIn(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  const serviceName = String(formData.get("serviceName") ?? "").trim() || defaultServiceName();
  const created = await db.attendanceSession.create({
    data: {
      churchId: session.churchId,
      branchId: session.branchId ?? undefined,
      serviceName,
      date: new Date(),
    },
  });
  revalidatePath("/app/attendance");
  redirect(`/app/attendance/${created.id}`);
}

/** Staff checks a member in to a session (increments the matching category). */
export async function checkInMember(sessionId: string, personId: string) {
  const session = await requireSession();
  assertCanWrite(session);

  const [sess, person, existing] = await Promise.all([
    db.attendanceSession.findFirst({ where: { id: sessionId, churchId: session.churchId } }),
    db.person.findFirst({
      where: { id: personId, churchId: session.churchId },
      select: { id: true, status: true, dateOfBirth: true, birthday: true },
    }),
    db.attendanceRecord.findFirst({ where: { sessionId, personId } }),
  ]);
  if (!sess || !person) return { ok: false as const, reason: "not-found" as const };
  if (existing) return { ok: false as const, reason: "already" as const, recordId: existing.id };

  const category = categoryForPerson(person);
  const record = await db.attendanceRecord.create({
    data: {
      churchId: session.churchId,
      branchId: sess.branchId ?? undefined,
      personId,
      sessionId,
      category,
      serviceName: sess.serviceName,
      date: new Date(),
      method: "manual",
    },
  });
  await db.attendanceSession.update({
    where: { id: sessionId },
    data: { [CATEGORY_FIELD[category]]: { increment: 1 } },
  });

  // Deliberately NOT calling revalidatePath here: this is the check-in queue
  // hot path, and re-rendering the page re-sends every candidate — including
  // megabytes of base64 member photos — on every single check-in. The client
  // updates optimistically from the record returned below, so a queue stays
  // instant. Counts re-sync naturally on the next navigation/refresh.
  return { ok: true as const, recordId: record.id, category };
}

/** Check a member in by scanning their member-ID QR code. Returns a result. */
export async function checkInByMemberId(
  sessionId: string,
  rawCode: string,
): Promise<{ ok: boolean; name?: string; message: string }> {
  const session = await requireSession();
  assertCanWrite(session);

  const memberId = rawCode.trim().toUpperCase();
  if (!memberId) return { ok: false, message: "Empty code" };

  const person = await db.person.findFirst({
    where: { churchId: session.churchId, memberId },
    select: { id: true, firstName: true, lastName: true, status: true, dateOfBirth: true, birthday: true },
  });
  if (!person) return { ok: false, message: `No member with ID ${memberId}` };

  const sess = await db.attendanceSession.findFirst({ where: { id: sessionId, churchId: session.churchId } });
  if (!sess) return { ok: false, message: "Session not found" };

  const dup = await db.attendanceRecord.findFirst({ where: { sessionId, personId: person.id } });
  if (dup) return { ok: true, name: `${person.firstName} ${person.lastName}`, message: "Already checked in" };

  const category = categoryForPerson(person);
  await db.attendanceRecord.create({
    data: {
      churchId: session.churchId,
      branchId: sess.branchId ?? undefined,
      personId: person.id,
      sessionId,
      category,
      serviceName: sess.serviceName,
      date: new Date(),
      method: "qr",
    },
  });
  await db.attendanceSession.update({
    where: { id: sessionId },
    data: { [CATEGORY_FIELD[category]]: { increment: 1 } },
  });
  revalidatePath(`/app/attendance/${sessionId}`);
  return { ok: true, name: `${person.firstName} ${person.lastName}`, message: "Checked in" };
}

/** Remove a check-in and decrement the matching category. */
export async function undoCheckIn(recordId: string) {
  const session = await requireSession();
  assertCanWrite(session);
  const rec = await db.attendanceRecord.findFirst({
    where: { id: recordId, churchId: session.churchId },
  });
  if (!rec || !rec.sessionId) return { ok: false as const };
  await db.attendanceRecord.delete({ where: { id: rec.id } });
  await db.attendanceSession.update({
    where: { id: rec.sessionId },
    data: { [CATEGORY_FIELD[(rec.category as AttendanceCategory) ?? "adult"]]: { decrement: 1 } },
  });
  // No revalidatePath — same reason as checkInMember: it would re-send every
  // candidate photo. The client removes the row optimistically.
  return { ok: true as const, personId: rec.personId };
}

export async function deleteSession(sessionId: string) {
  const session = await requireSession();
  assertCanWrite(session);
  await db.attendanceSession.deleteMany({ where: { id: sessionId, churchId: session.churchId } });
  revalidatePath("/app/attendance");
  redirect("/app/attendance");
}

/**
 * Public self check-in (QR target). No auth. Matches an existing member by phone
 * or name; otherwise records a visitor. Increments the session category.
 */
export async function selfCheckIn(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  if (!sessionId) return;
  const sess = await db.attendanceSession.findUnique({
    where: { id: sessionId },
    include: { church: { select: { id: true, isDemo: true } } },
  });
  if (!sess || sess.church.isDemo) return;

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name) return;

  const churchId = sess.church.id;
  let person: { id: string; status: string | null; dateOfBirth: Date | null; birthday: string | null } | null = null;
  if (phone) {
    person = await db.person.findFirst({
      where: { churchId, phone },
      select: { id: true, status: true, dateOfBirth: true, birthday: true },
    });
  }
  if (!person) {
    const [first, ...rest] = name.split(" ");
    person = await db.person.findFirst({
      where: { churchId, firstName: first, lastName: rest.join(" ") || undefined },
      select: { id: true, status: true, dateOfBirth: true, birthday: true },
    });
  }

  // Avoid duplicate self check-ins for a matched member.
  if (person) {
    const dup = await db.attendanceRecord.findFirst({ where: { sessionId, personId: person.id } });
    if (dup) redirect(`/checkin/${sessionId}/done`);
  }

  const category: AttendanceCategory = person ? categoryForPerson(person) : "visitor";
  await db.attendanceRecord.create({
    data: {
      churchId,
      branchId: sess.branchId ?? undefined,
      personId: person?.id,
      guestName: person ? undefined : name,
      sessionId,
      category,
      serviceName: sess.serviceName,
      date: new Date(),
      method: "self",
    },
  });
  await db.attendanceSession.update({
    where: { id: sessionId },
    data: { [CATEGORY_FIELD[category]]: { increment: 1 } },
  });

  redirect(`/checkin/${sessionId}/done`);
}

function clamp(v: FormDataEntryValue | null): number {
  return Math.min(Math.max(Number(v ?? 0) || 0, 0), 100000);
}

function defaultServiceName(): string {
  const d = new Date();
  const day = d.toLocaleDateString("en-GH", { weekday: "long" });
  return `${day} Service`;
}
