"use server";

import { db } from "@/lib/db";
import { findBookingConflict } from "@/lib/bookings/conflicts";
import { zonedToUtc } from "@/lib/time/tz";
import { priceFor, asRateUnit } from "@/lib/bookings/pricing";
import { FORM_KINDS, collectExtraAnswers } from "@/lib/forms/kinds";
import { allowPublicSubmission } from "@/lib/public-guard";

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
    select: { id: true, name: true, isDemo: true, suspended: true, publicBookingOn: true, timezone: true, bookingFormFields: true },
  });
  if (!church || church.isDemo || church.suspended || !church.publicBookingOn) return { ok: false, error: "Booking requests aren't open right now." };
  if (!(await allowPublicSubmission("booking", church.id))) return { ok: false, error: "Too many requests from this connection. Please try again later." };

  const facilityId = str(formData.get("facilityId"));
  const facility = await db.facility.findFirst({
    where: { id: facilityId, churchId: church.id, isActive: true, publicBookable: true },
    select: { id: true, name: true, rate: true, rateUnit: true },
  });
  if (!facility) return { ok: false, error: "Please choose a facility." };

  const name = str(formData.get("name")).slice(0, 120);
  const phone = str(formData.get("phone")).slice(0, 30);
  const email = str(formData.get("email")).slice(0, 160);
  const purpose = str(formData.get("purpose")).slice(0, 160) || "Facility booking";
  if (!name || !phone) return { ok: false, error: "Please add your name and phone number." };
  if (phone.replace(/\D/g, "").length < 9) return { ok: false, error: "That phone number looks too short." };

  // Dates are what the person typed, in the church's own timezone.
  const startDate = str(formData.get("startDate"));
  const startTime = str(formData.get("startTime"));
  const endDateRaw = str(formData.get("endDate"));
  const endTimeRaw = str(formData.get("endTime"));
  const okDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const okTime = (v: string) => /^\d{2}:\d{2}$/.test(v);
  if (!okDate(startDate) || !okTime(startTime)) return { ok: false, error: "Please choose the day and the time you need it from." };
  const endDate = okDate(endDateRaw) ? endDateRaw : startDate;
  if (endDate < startDate) return { ok: false, error: "The last day cannot be before the first day." };
  const unit = asRateUnit(facility.rateUnit);
  if (unit === "hour" && !okTime(endTimeRaw)) return { ok: false, error: "Please add an end time so the price can be worked out." };
  // No end time means they keep it until the end of that day.
  const endTime = okTime(endTimeRaw) ? endTimeRaw : "23:59";
  const start = zonedToUtc(startDate, startTime, church.timezone);
  const end = zonedToUtc(endDate, endTime, church.timezone);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { ok: false, error: "Please choose when you need it." };
  if (end <= start) return { ok: false, error: "The end time must be after the start." };
  if (start.getTime() < Date.now() - 3600_000) return { ok: false, error: "That time has already passed." };
  if (start.getTime() > Date.now() + 366 * 86400_000) return { ok: false, error: "Please choose a date within the next year." };

  const rate = facility.rate ? Number(facility.rate) : null;
  const price = priceFor({ unit, rate, startDate, startTime, endDate, endTime: okTime(endTimeRaw) ? endTimeRaw : undefined });
  const extra = collectExtraAnswers(FORM_KINDS.book.resolve(church.bookingFormFields), (id) => formData.getAll(id).map(String));

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
      ...(price.amount != null ? { amount: price.amount } : {}),
      ...(extra.length ? { extra } : {}),
    },
  });

  const when = start.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: church.timezone });
  const { notifyChurchAdmins } = await import("@/lib/notify/admins");
  await notifyChurchAdmins(church.id, {
    subject: "New facility booking request",
    sms: `New booking request: ${name} wants ${facility.name} on ${when} (${purpose}). Open WorshipHQ > Facility bookings to confirm or decline.`,
  });
  return { ok: true };
}
