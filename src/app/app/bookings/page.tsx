import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { BookingsClient } from "@/components/app/bookings-client";
import { createFacility, createBooking } from "@/app/actions/bookings";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus, Building } from "lucide-react";

export const metadata = { title: "Facility bookings" };

export default async function BookingsPage() {
  const session = await requireModule("events");

  const [facilities, bookings] = await Promise.all([
    db.facility.findMany({
      where: { churchId: session.churchId },
      orderBy: { name: "asc" },
    }),
    db.booking.findMany({
      where: { churchId: session.churchId, startTime: { gte: new Date(Date.now() - 30 * 86400000) } },
      include: { facility: { select: { name: true } } },
      orderBy: { startTime: "asc" },
      take: 200,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Facility bookings"
        description="Manage room and facility reservations."
      >
        <div className="flex gap-2">
          <ActionDialog
            triggerLabel="Add facility"
            triggerIcon={<Building className="size-4" />}
            title="Add facility"
            description="Register a room or facility that can be booked."
            submitLabel="Save"
            action={createFacility}
            disabled={session.isDemo}
            variant="secondary"
          >
            <Field label="Name" name="name" placeholder="e.g. Main hall" required />
            <Field label="Capacity" name="capacity" type="number" placeholder="0" />
            <Field label="Location" name="location" placeholder="Building or floor" />
          </ActionDialog>

          <ActionDialog
            triggerLabel="Book"
            triggerIcon={<Plus className="size-4" />}
            title="Book a facility"
            description="Reserve a room or space for an event or meeting."
            submitLabel="Book"
            action={createBooking}
            disabled={session.isDemo || facilities.length === 0}
          >
            <Field label="Event title" name="title" placeholder="What's happening" required />
            <Field
              label="Facility"
              name="facilityId"
              options={facilities.map((f) => ({ label: `${f.name}${f.capacity ? ` (${f.capacity} capacity)` : ""}`, value: f.id }))}
              required
            />
            <Field label="Booked by" name="bookedBy" placeholder="Name or group" required />
            <Field label="Start" name="startTime" type="datetime-local" required />
            <Field label="End" name="endTime" type="datetime-local" required />
            <Field label="Notes" name="notes" placeholder="Additional details..." />
          </ActionDialog>
        </div>
      </PageHeader>

      <BookingsClient
        facilities={facilities.map((f) => ({
          id: f.id,
          name: f.name,
          capacity: f.capacity,
          location: f.location,
        }))}
        bookings={bookings.map((b) => ({
          id: b.id,
          title: b.title,
          facilityName: b.facility.name,
          bookedBy: b.bookedBy,
          startTime: b.startTime.toISOString(),
          endTime: b.endTime.toISOString(),
          status: b.status,
          notes: b.notes,
        }))}
      />
    </div>
  );
}
