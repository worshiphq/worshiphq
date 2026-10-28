"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, assertCanDelete } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { RecycleBin } from "@/lib/recycle-bin";

export async function deleteEvent(id: string) {
  const session = await requireSession();
  assertCanDelete(session);
  const ev = await db.event.findFirst({ where: { id, churchId: session.churchId }, select: { title: true } });
  await RecycleBin.captureEvent(session, id);
  await db.event.deleteMany({ where: { id, churchId: session.churchId } });
  if (ev) await audit(session, "delete", "event", `Deleted event "${ev.title}"`, id);
  revalidatePath("/app/events");
}

export async function createEvent(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session, "events");

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "09:00");
  const startsAt = new Date(`${date}T${time || "09:00"}`);
  const paid = String(formData.get("paid") ?? "Free") === "Paid";
  const price = Number(formData.get("price") ?? 0);
  const capacity = Number(formData.get("capacity") ?? 0);

  // Multi-day: an end date (contiguous range) and/or explicit extra days
  // (comma-separated YYYY-MM-DD) for non-contiguous events like Wed/Thu/Fri/Sun.
  const endDateStr = String(formData.get("endDate") ?? "").trim();
  const endsAt = endDateStr ? new Date(`${endDateStr}T${time || "09:00"}`) : null;
  const extraDates = String(formData.get("extraDates") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean)
    .map((s) => new Date(`${s}T${time || "09:00"}`))
    .filter((d) => !isNaN(d.getTime()));

  const ev = await db.event.create({
    data: {
      churchId: session.churchId,
      branchId: session.branchId ?? undefined,
      title,
      type: String(formData.get("type") ?? "Service"),
      startsAt: isNaN(startsAt.getTime()) ? new Date() : startsAt,
      endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
      dates: extraDates.length ? extraDates : [],
      location: String(formData.get("location") ?? "").trim() || undefined,
      notes: String(formData.get("notes") ?? "").trim() || undefined,
      capacity: capacity || undefined,
      paid,
      price: paid && price > 0 ? price : undefined,
    },
  });

  await audit(session, "create", "event", `Created event "${title}"`, ev.id);
  revalidatePath("/app/events");
}

export async function updateEvent(id: string, formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session, "events");
  const ev = await db.event.findFirst({ where: { id, churchId: session.churchId }, select: { id: true } });
  if (!ev) return;

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "09:00") || "09:00";
  const startsAt = new Date(`${date}T${time}`);
  const paid = String(formData.get("paid") ?? "Free") === "Paid";
  const price = Number(formData.get("price") ?? 0);
  const capacity = Number(formData.get("capacity") ?? 0);

  await db.event.update({
    where: { id },
    data: {
      title,
      type: String(formData.get("type") ?? "Service"),
      ...(isNaN(startsAt.getTime()) ? {} : { startsAt }),
      location: String(formData.get("location") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      capacity: capacity > 0 ? capacity : null,
      paid,
      price: paid && price > 0 ? price : null,
    },
  });
  await audit(session, "update", "event", `Updated event "${title}"`, id);
  revalidatePath(`/app/events/${id}`);
  revalidatePath("/app/events");
}

export type AttendeeResult = { ok: boolean; error?: string } | null;

/** Add someone to an event by hand. Stops when the event is at its capacity. */
export async function addRegistration(eventId: string, _prev: AttendeeResult, formData: FormData): Promise<AttendeeResult> {
  const session = await requireSession();
  assertCanWrite(session, "events");
  const ev = await db.event.findFirst({ where: { id: eventId, churchId: session.churchId }, select: { id: true, title: true, capacity: true } });
  if (!ev) return { ok: false, error: "That event was not found." };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Please enter the person's name." };
  if (ev.capacity) {
    const count = await db.registration.count({ where: { eventId } });
    if (count >= ev.capacity) return { ok: false, error: `This event is full (${ev.capacity} places). Raise the capacity in Edit event to add more people.` };
  }
  await db.registration.create({
    data: {
      eventId,
      name: name.slice(0, 120),
      phone: String(formData.get("phone") ?? "").trim().slice(0, 40) || null,
      email: String(formData.get("email") ?? "").trim().slice(0, 120) || null,
    },
  });
  await audit(session, "create", "event", `Added ${name} to "${ev.title}"`, eventId);
  revalidatePath(`/app/events/${eventId}`);
  revalidatePath("/app/events");
  return { ok: true };
}

export async function setRegistrationCheckedIn(id: string, checkedIn: boolean) {
  const session = await requireSession();
  assertCanWrite(session, "events");
  const reg = await db.registration.findFirst({ where: { id, event: { churchId: session.churchId } }, select: { eventId: true } });
  if (!reg) return;
  await db.registration.update({ where: { id }, data: { checkedIn } });
  revalidatePath(`/app/events/${reg.eventId}`);
}

export async function removeRegistration(id: string) {
  const session = await requireSession();
  assertCanWrite(session, "events");
  const reg = await db.registration.findFirst({ where: { id, event: { churchId: session.churchId } }, select: { eventId: true, name: true } });
  if (!reg) return;
  await db.registration.delete({ where: { id } });
  await audit(session, "delete", "event", `Removed ${reg.name} from an event`, reg.eventId);
  revalidatePath(`/app/events/${reg.eventId}`);
  revalidatePath("/app/events");
}
