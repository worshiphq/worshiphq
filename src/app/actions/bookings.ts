"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function createFacility(formData: FormData) {
  const session = await requireModule("events");
  if (session.isDemo) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const capacity = parseInt(String(formData.get("capacity") ?? "0")) || null;
  const location = String(formData.get("location") ?? "").trim() || null;

  await db.facility.create({
    data: { churchId: session.churchId, name, capacity, location },
  });

  revalidatePath("/app/bookings");
}

export async function deleteFacility(formData: FormData) {
  const session = await requireModule("events");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  await db.facility.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/bookings");
}

export async function createBooking(formData: FormData) {
  const session = await requireModule("events");
  if (session.isDemo) return;

  const title = String(formData.get("title") ?? "").trim();
  const facilityId = String(formData.get("facilityId") ?? "").trim();
  const bookedBy = String(formData.get("bookedBy") ?? "").trim();
  const startTime = String(formData.get("startTime") ?? "").trim();
  const endTime = String(formData.get("endTime") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!title || !facilityId || !bookedBy || !startTime || !endTime) return;

  const booking = await db.booking.create({
    data: {
      churchId: session.churchId,
      facilityId,
      title,
      bookedBy,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      notes,
    },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "booking", entityId: booking.id, detail: `Booked: ${title}` });
  revalidatePath("/app/bookings");
}

export async function deleteBooking(formData: FormData) {
  const session = await requireModule("events");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  await db.booking.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/bookings");
}
