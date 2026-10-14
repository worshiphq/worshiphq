"use server";

import { revalidatePath } from "next/cache";
import { requireModule, requireManage } from "@/lib/auth";
import { db } from "@/lib/db";
import { moveToBin } from "@/lib/recycle-bin";
import { logAudit } from "@/lib/audit";
import { storeImage } from "@/lib/storage";
import { resolveAccountId } from "@/lib/data/accounts";
import { findBookingConflict } from "@/lib/bookings/conflicts";
import type { GiftMethod } from "@prisma/client";

type Result = { ok: true; id?: string } | { ok: false; error: string };

const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/* ── Facilities ── */

/** Create or update a facility. Photos arrive as a resized data URL and are stored
 *  in the image bucket; leaving the photo untouched keeps the current one. */
export async function saveFacility(formData: FormData): Promise<Result> {
  const session = await requireManage("bookings");
  if (session.isDemo) return { ok: false, error: "This is the read-only demo." };

  const id = str(formData.get("id"));
  const name = str(formData.get("name"));
  if (!name) return { ok: false, error: "Give the facility a name." };

  const data = {
    name,
    capacity: parseInt(str(formData.get("capacity")), 10) || null,
    location: str(formData.get("location")) || null,
    description: str(formData.get("description")) || null,
    rate: num(formData.get("rate")),
    publicBookable: formData.get("publicBookable") === "on",
  };

  let imageUpdate: { imageUrl: string | null } | Record<string, never> = {};
  if (formData.get("imageChanged") === "1") {
    const raw = str(formData.get("imageUrl"));
    if (!raw) imageUpdate = { imageUrl: null };
    else if (raw.startsWith("data:image/") && raw.length < 1_800_000) imageUpdate = { imageUrl: ((await storeImage(raw, "facilities")) as string) ?? null };
    else if (raw.startsWith("data:image/")) return { ok: false, error: "That photo is too large. Try a smaller one." };
  }

  if (id) {
    const own = await db.facility.findFirst({ where: { id, churchId: session.churchId }, select: { id: true } });
    if (!own) return { ok: false, error: "Facility not found." };
    await db.facility.update({ where: { id }, data: { ...data, ...imageUpdate } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "update", entity: "facility", entityId: id, detail: `Updated facility "${name}"` });
  } else {
    const created = await db.facility.create({ data: { churchId: session.churchId, ...data, ...imageUpdate } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "facility", entityId: created.id, detail: `Added facility "${name}"` });
  }
  revalidatePath("/app/bookings");
  return { ok: true };
}

/** Kept for older callers (the simple "Add facility" form). */
export async function createFacility(formData: FormData) {
  await saveFacility(formData);
}

export async function deleteFacility(formData: FormData) {
  const session = await requireManage("bookings");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const bookingIds = (await db.booking.findMany({ where: { facilityId: id, churchId: session.churchId }, select: { id: true } })).map((b) => b.id);
  const txIds = await paymentTransactionIds(session.churchId, bookingIds);
  await moveToBin(session, "facility", "Facility", id, { alsoRoots: txIds.map((t) => ({ model: "Transaction" as const, id: t })) });
  if (txIds.length) await db.transaction.deleteMany({ where: { id: { in: txIds }, churchId: session.churchId } });
  await db.facility.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/bookings");
  revalidatePath("/app/accounting");
  revalidatePath("/app/calendar");
}

export async function savePublicBookingSettings(formData: FormData): Promise<Result> {
  const session = await requireManage("bookings");
  if (session.isDemo) return { ok: false, error: "This is the read-only demo." };
  await db.church.update({
    where: { id: session.churchId },
    data: { publicBookingOn: formData.get("on") === "on", bookingNote: str(formData.get("note")).slice(0, 1500) || null },
  });
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "update", entity: "settings", detail: "Updated the public booking link" });
  revalidatePath("/app/bookings");
  return { ok: true };
}

/* ── Bookings ── */

/** Create or update a booking. Refuses to double-book a facility. */
export async function saveBooking(formData: FormData): Promise<Result> {
  const session = await requireManage("bookings");
  if (session.isDemo) return { ok: false, error: "This is the read-only demo." };

  const id = str(formData.get("id"));
  const title = str(formData.get("title"));
  const facilityId = str(formData.get("facilityId"));
  const bookedBy = str(formData.get("bookedBy"));
  const startRaw = str(formData.get("startTime"));
  const endRaw = str(formData.get("endTime"));
  if (!title || !facilityId || !bookedBy || !startRaw || !endRaw) return { ok: false, error: "Fill in the title, facility, who it is for, and the start and end." };

  const startTime = new Date(startRaw);
  const endTime = new Date(endRaw);
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) return { ok: false, error: "Those dates don't look right." };
  if (endTime <= startTime) return { ok: false, error: "The end must be after the start." };

  const facility = await db.facility.findFirst({ where: { id: facilityId, churchId: session.churchId }, select: { id: true, name: true } });
  if (!facility) return { ok: false, error: "Pick a facility." };

  const conflict = await findBookingConflict(session.churchId, facility.id, startTime, endTime, id || undefined);
  if (conflict) {
    return { ok: false, error: `${facility.name} is already booked then: "${conflict.title}" (${conflict.when}). Choose another time or facility.` };
  }

  const data = {
    facilityId: facility.id,
    title,
    bookedBy,
    startTime,
    endTime,
    notes: str(formData.get("notes")) || null,
    contactPhone: str(formData.get("contactPhone")) || null,
    contactEmail: str(formData.get("contactEmail")) || null,
    amount: num(formData.get("amount")),
  };

  if (id) {
    const own = await db.booking.findFirst({ where: { id, churchId: session.churchId }, select: { id: true } });
    if (!own) return { ok: false, error: "Booking not found." };
    await db.booking.update({ where: { id }, data });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "update", entity: "booking", entityId: id, detail: `Updated booking: ${title}` });
  } else {
    const booking = await db.booking.create({ data: { churchId: session.churchId, ...data } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "booking", entityId: booking.id, detail: `Booked: ${title}` });
  }
  revalidatePath("/app/bookings");
  revalidatePath("/app/calendar");
  return { ok: true };
}

/** Kept for older callers. */
export async function createBooking(formData: FormData) {
  await saveBooking(formData);
}

/** Approve or decline a request that came in through the public booking link. */
export async function decideBooking(id: string, decision: "confirmed" | "declined"): Promise<Result> {
  const session = await requireManage("bookings");
  if (session.isDemo) return { ok: false, error: "This is the read-only demo." };

  const b = await db.booking.findFirst({ where: { id, churchId: session.churchId }, include: { facility: { select: { name: true } } } });
  if (!b) return { ok: false, error: "Booking not found." };

  if (decision === "confirmed") {
    const conflict = await findBookingConflict(session.churchId, b.facilityId, b.startTime, b.endTime, b.id);
    if (conflict) return { ok: false, error: `Can't confirm: ${b.facility.name} is already booked then ("${conflict.title}", ${conflict.when}).` };
  }
  await db.booking.update({ where: { id }, data: { status: decision } });

  // Let the requester know (best effort - needs a phone number and SMS credits).
  if (b.source === "public" && b.contactPhone) {
    const when = b.startTime.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const text = decision === "confirmed"
      ? `Your booking request for ${b.facility.name} on ${when} is confirmed. Thank you!`
      : `Sorry, we can't take your booking request for ${b.facility.name} on ${when}. Please contact the church office.`;
    const { sendChurchSms } = await import("@/lib/sms/credits");
    await sendChurchSms(session.churchId, b.contactPhone, text, { note: "Booking reply" }).catch(() => {});
  }
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "update", entity: "booking", entityId: id, detail: `${decision === "confirmed" ? "Confirmed" : "Declined"} booking: ${b.title}` });
  revalidatePath("/app/bookings");
  revalidatePath("/app/calendar");
  return { ok: true };
}

/** Transactions that mirror a booking's payments. */
async function paymentTransactionIds(churchId: string, bookingIds: string[]): Promise<string[]> {
  if (bookingIds.length === 0) return [];
  const pays = await db.bookingPayment.findMany({ where: { churchId, bookingId: { in: bookingIds }, transactionId: { not: null } }, select: { transactionId: true } });
  return pays.map((p) => p.transactionId!).filter(Boolean);
}

export async function deleteBooking(formData: FormData) {
  const session = await requireManage("bookings");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const txIds = await paymentTransactionIds(session.churchId, [id]);
  // The money recorded for it goes to the recycle bin too, so a restore brings both back.
  await moveToBin(session, "booking", "Booking", id, { alsoRoots: txIds.map((t) => ({ model: "Transaction" as const, id: t })) });
  if (txIds.length) await db.transaction.deleteMany({ where: { id: { in: txIds }, churchId: session.churchId } });
  await db.booking.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/bookings");
  revalidatePath("/app/calendar");
  revalidatePath("/app/accounting");
}

/* ── Payments received for a booking ── */

const METHODS: Record<string, GiftMethod> = {
  Cash: "Cash", MTN_MoMo: "MTN_MoMo", Telecel_Cash: "Telecel_Cash", AirtelTigo: "AirtelTigo", Card: "Card", Bank: "Bank",
};

/**
 * Record money received for a booking. It lands in the account you choose (or the
 * default one) as income under "Facility hire", so account balances and the
 * accounting ledger stay right without any double entry.
 */
export async function recordBookingPayment(formData: FormData): Promise<Result> {
  const session = await requireManage("bookings");
  if (session.isDemo) return { ok: false, error: "This is the read-only demo." };

  const bookingId = str(formData.get("bookingId"));
  const amount = num(formData.get("amount"));
  if (!amount) return { ok: false, error: "Enter how much was paid." };

  const booking = await db.booking.findFirst({ where: { id: bookingId, churchId: session.churchId }, include: { facility: { select: { name: true } }, payments: { select: { amount: true } } } });
  if (!booking) return { ok: false, error: "Booking not found." };

  const method = METHODS[str(formData.get("method"))] ?? "Cash";
  // "Not banked yet" (e.g. cash still in hand): counted as income, but in no account until it is banked.
  const notBanked = formData.get("notBanked") === "1";
  const accountId = notBanked ? null : await resolveAccountId(session.churchId, str(formData.get("accountId")) || null);
  const dateRaw = str(formData.get("date"));
  const date = dateRaw && !Number.isNaN(new Date(dateRaw).getTime()) ? new Date(dateRaw) : new Date();
  const note = str(formData.get("note")) || null;

  const tx = await db.transaction.create({
    data: {
      churchId: session.churchId,
      accountId,
      pendingDeposit: notBanked,
      description: `${booking.facility.name} booking: ${booking.title} (${booking.bookedBy})`,
      category: "Facility hire",
      amount,
      date,
    },
  });
  const payment = await db.bookingPayment.create({
    data: { churchId: session.churchId, bookingId, amount, method, accountId, note, transactionId: tx.id, date },
  });
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "booking", entityId: bookingId, detail: `Received GHS ${amount} for booking: ${booking.title}` });
  revalidatePath("/app/bookings");
  revalidatePath("/app/accounting");
  return { ok: true, id: payment.id };
}

export async function deleteBookingPayment(paymentId: string): Promise<Result> {
  const session = await requireManage("bookings");
  if (session.isDemo) return { ok: false, error: "This is the read-only demo." };

  const pay = await db.bookingPayment.findFirst({ where: { id: paymentId, churchId: session.churchId }, select: { id: true, transactionId: true, bookingId: true } });
  if (!pay) return { ok: false, error: "Payment not found." };
  await moveToBin(session, "bookingPayment", "BookingPayment", pay.id, {
    label: "Booking payment",
    alsoRoots: pay.transactionId ? [{ model: "Transaction" as const, id: pay.transactionId }] : [],
  });
  if (pay.transactionId) await db.transaction.deleteMany({ where: { id: pay.transactionId, churchId: session.churchId } });
  await db.bookingPayment.deleteMany({ where: { id: pay.id, churchId: session.churchId } });
  revalidatePath("/app/bookings");
  revalidatePath("/app/accounting");
  return { ok: true };
}
