"use server";

import { db } from "@/lib/db";
import { findBookingConflict } from "@/lib/bookings/conflicts";

type Result = { ok: true } | { ok: false; error: string };

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/**
 * Someone outside the church asks to book a facility through the public link.
 * It is saved as a pending request (never auto-confirmed) so the church decides,
 * and it can't overlap a booking that's already confirmed.
 */
export async function requestFacilityBooking(formData: FormData): Promise<Result> {
  // Honeypot: real people leave this hidden field empty.
  if (str(formData.get("website"))) return { ok: true };

  const slug = str(formData.get("churchSlug"));
  const church = await db.church.findUnique({
    where: { slug },
    select: { id: true, name: true, isDemo: true, suspended: true, publicBookingOn: true },
  });
  if (!church || church.isDemo || church.suspended || !church.publicBookingOn) return { ok: false, error: "Booking requests aren't open right now." };

  const facilityId = str(formData.get("facilityId"));
  const facility = await db.facility.findFirst({
    where: { id: facilityId, churchId: church.id, isActive: true, publicBookable: true },
    select: { id: true, name: true },
  });
  if (!facility) return { ok: false, error: "Please choose a facility." };

  const name = str(formData.get("name")).slice(0, 120);
  const phone = str(formData.get("phone")).slice(0, 30);
  const email = str(formData.get("email")).slice(0, 160);
  const purpose = str(formData.get("purpose")).slice(0, 160);
  if (!name || !phone || !purpose) return { ok: false, error: "Please add your name, phone number and what the booking is for." };
  if (phone.replace(/\D/g, "").length < 9) return { ok: false, error: "That phone number looks too short." };

  const start = new Date(str(formData.get("startTime")));
  const end = new Date(str(formData.get("endTime")));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { ok: false, error: "Please choose when you need it." };
  if (end <= start) return { ok: false, error: "The end time must be after the start." };
  if (start.getTime() < Date.now() - 3600_000) return { ok: false, error: "That time has already passed." };
  if (start.getTime() > Date.now() + 366 * 86400_000) return { ok: false, error: "Please choose a date within the next year." };

  const conflict = await findBookingConflict(church.id, facility.id, start, end);
  if (conflict) return { ok: false, error: `Sorry, ${facility.name} is already taken at that time. Please try another time.` };

  // Cap open requests per phone so the form can't be used to flood the church.
  const open = await db.booking.count({ where: { churchId: church.id, source: "public", status: "pending", contactPhone: phone } });
  if (open >= 3) return { ok: false, error: "You already have requests waiting for a reply. We'll be in touch soon." };

  await db.booking.create({
    data: {
      churchId: church.id,
      facilityId: facility.id,
      title: purpose,
      bookedBy: name,
      contactPhone: phone,
      contactEmail: email || null,
      startTime: start,
      endTime: end,
      notes: str(formData.get("notes")).slice(0, 600) || null,
      status: "pending",
      source: "public",
    },
  });

  const when = start.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const { notifyChurchAdmins } = await import("@/lib/notify/admins");
  await notifyChurchAdmins(church.id, {
    subject: "New facility booking request",
    sms: `New booking request: ${name} wants ${facility.name} on ${when} (${purpose}). Open WorshipHQ > Facility bookings to confirm or decline.`,
  });
  return { ok: true };
}
