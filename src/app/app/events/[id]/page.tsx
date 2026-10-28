import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, Pencil, Ticket, Users } from "lucide-react";
import { canEdit } from "@/lib/permissions";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateEvent } from "@/app/actions/events";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { AddAttendeeForm, AttendeeActions } from "@/components/app/event-attendees";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Manage event" };

const pad = (n: number) => String(n).padStart(2, "0");

export default async function ManageEventPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireModule("events");
  const { id } = await params;
  const ev = await db.event.findFirst({
    where: { id, churchId: session.churchId },
    include: { registrations: { orderBy: { createdAt: "asc" } }, branch: { select: { name: true } } },
  });
  if (!ev) notFound();

  const editable = canEdit(session, "events");
  const registered = ev.registrations.length;
  const checkedIn = ev.registrations.filter((r) => r.checkedIn).length;
  const left = ev.capacity ? Math.max(0, ev.capacity - registered) : null;
  const d = ev.startsAt;
  const dateValue = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const timeValue = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  return (
    <div>
      <Link href="/app/events" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" /> All events
      </Link>
      <PageHeader title={ev.title} description={`${formatDate(ev.startsAt.toISOString())} · ${timeValue}${ev.location ? ` · ${ev.location}` : ""}`}>
        {editable && (
          <ActionDialog
            triggerLabel="Edit event"
            triggerIcon={<Pencil />}
            variant="secondary"
            title="Edit event"
            submitLabel="Save changes"
            successMessage="Event updated"
            action={updateEvent.bind(null, ev.id)}
          >
            <Field label="Event title" name="title" defaultValue={ev.title} required />
            <Field label="Type" name="type" options={["Service", "Seminar", "Camp", "Special", "Retreat", "Conference"]} defaultValue={ev.type ?? "Service"} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" name="date" type="date" defaultValue={dateValue} required />
              <Field label="Time" name="time" type="time" defaultValue={timeValue} />
            </div>
            <Field label="Location" name="location" defaultValue={ev.location ?? ""} placeholder="Main auditorium" />
            <Field label="Capacity" name="capacity" type="number" defaultValue={ev.capacity ?? ""} placeholder="Leave empty for no limit" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pricing" name="paid" options={["Free", "Paid"]} defaultValue={ev.paid ? "Paid" : "Free"} />
              <Field label="Price (₵)" name="price" type="number" defaultValue={ev.price ? Number(ev.price) : ""} placeholder="0" />
            </div>
            <Field label="Notes" name="notes" rows={3} defaultValue={ev.notes ?? ""} />
          </ActionDialog>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Registered" value={registered} icon={Users} />
        <StatCard label="Checked in" value={checkedIn} icon={Users} />
        <StatCard label={ev.capacity ? "Places left" : "Capacity (no limit)"} value={left ?? 0} icon={CalendarDays} />
        <StatCard label={ev.paid ? "Price per person" : "Price (free event)"} value={ev.paid ? Number(ev.price ?? 0) : 0} prefix="₵" decimals={ev.paid ? 2 : 0} icon={Ticket} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        {ev.type && <Badge variant="success">{ev.type}</Badge>}
        <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5 text-ink-faint" /> {ev.location || ev.branch?.name || "All branches"}</span>
      </div>
      {ev.notes && <p className="mt-3 max-w-2xl whitespace-pre-line text-sm text-ink-muted">{ev.notes}</p>}

      {editable && (
        <Card className="mt-6 p-5">
          <h2 className="font-display text-lg font-semibold">Add someone</h2>
          <p className="mb-4 mt-0.5 text-sm text-ink-muted">For people who sign up in person or by phone.</p>
          <AddAttendeeForm eventId={ev.id} />
        </Card>
      )}

      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line p-5">
          <h2 className="font-display text-lg font-semibold">Attendees</h2>
          <span className="text-sm text-ink-muted">{registered}{ev.capacity ? ` of ${ev.capacity}` : ""}</span>
        </div>
        {registered === 0 ? (
          <div className="px-5 py-14 text-center text-sm text-ink-muted">No one is registered for this event yet.</div>
        ) : (
          <ul className="divide-y divide-line">
            {ev.registrations.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className="truncate text-xs text-ink-muted">{[r.phone, r.email].filter(Boolean).join(" · ") || "No contact details"}</div>
                </div>
                <AttendeeActions id={r.id} name={r.name} checkedIn={r.checkedIn} canEdit={editable} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
