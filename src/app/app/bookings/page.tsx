import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { BookingsClient } from "@/components/app/bookings-client";
import { PageHeader } from "@/components/app/page-header";
import { getAccountOptions } from "@/lib/data/accounts";
import { asRateUnit } from "@/lib/bookings/pricing";
import { asExtra } from "@/components/app/extra-answers";

export const metadata = { title: "Facility bookings" };

export default async function BookingsPage() {
  const session = await requireModule("bookings");

  const [facilities, bookings, accounts, church] = await Promise.all([
    db.facility.findMany({ where: { churchId: session.churchId }, orderBy: { name: "asc" } }),
    db.booking.findMany({
      where: {
        churchId: session.churchId,
        // Everything coming up, the last 90 days for the record, and any request still waiting.
        OR: [{ startTime: { gte: new Date(Date.now() - 90 * 86400000) } }, { status: "pending" }],
      },
      include: { facility: { select: { name: true } }, payments: { orderBy: { date: "desc" } } },
      orderBy: { startTime: "asc" },
      take: 400,
    }),
    getAccountOptions(session.churchId),
    db.church.findUnique({ where: { id: session.churchId }, select: { slug: true, isDemo: true, publicBookingOn: true, bookingNote: true } }),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <div>
      <PageHeader title="Facility bookings" description="Rooms and halls people can book. Confirmed bookings also show on your calendar." />

      <BookingsClient
        canWrite={canEdit(session, "bookings")}
        slug={church?.slug ?? ""}
        isDemo={church?.isDemo ?? session.isDemo}
        publicOn={church?.publicBookingOn ?? false}
        publicNote={church?.bookingNote ?? ""}
        accounts={accounts}
        facilities={facilities.map((f) => ({
          id: f.id,
          name: f.name,
          capacity: f.capacity,
          location: f.location,
          description: f.description,
          imageUrl: f.imageUrl,
          rate: f.rate ? Number(f.rate) : null,
          rateUnit: asRateUnit(f.rateUnit),
          publicBookable: f.publicBookable,
        }))}
        bookings={bookings.map((b) => ({
          id: b.id,
          title: b.title,
          facilityId: b.facilityId,
          facilityName: b.facility.name,
          bookedBy: b.bookedBy,
          contactPhone: b.contactPhone,
          contactEmail: b.contactEmail,
          startTime: b.startTime.toISOString(),
          endTime: b.endTime.toISOString(),
          status: b.status,
          source: b.source,
          notes: b.notes,
          extra: asExtra(b.extra),
          amount: b.amount ? Number(b.amount) : null,
          payments: b.payments.map((p) => ({
            id: p.id,
            amount: Number(p.amount),
            method: p.method,
            accountName: p.accountId ? accountName.get(p.accountId) ?? null : null,
            date: p.date.toISOString(),
            note: p.note,
          })),
        }))}
      />
    </div>
  );
}
