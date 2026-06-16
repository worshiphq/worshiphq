import { Plus, MapPin, Users, Ticket, QrCode, CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireModule } from "@/lib/auth";
import { getEvents } from "@/lib/data/modules";
import { createEvent, deleteEvent } from "@/app/actions/events";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { DeleteForm } from "@/components/app/delete-form";
import { formatCurrency } from "@/config/brand";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Events" };

export default async function EventsPage() {
  const session = await requireModule("events");
  const events = await getEvents(session.churchId);
  const canDelete = session.canDelete && !session.isDemo;
  const totalRegistered = events.reduce((s, e) => s + e.registered, 0);

  return (
    <div>
      <PageHeader title="Events & calendar" description="Services, seminars and camps — with registration and QR check-in.">
        <Button variant="secondary" size="sm"><CalendarDays /> Public calendar</Button>
        <ActionDialog
          triggerLabel="Create event"
          triggerIcon={<Plus />}
          title="Create event"
          description="Add a service, seminar or camp."
          submitLabel="Create event"
          action={createEvent}
          disabled={session.isDemo}
        >
          <Field label="Event title" name="title" placeholder="Sunday Celebration Service" required />
          <Field label="Type" name="type" options={["Service", "Seminar", "Camp", "Special", "Retreat", "Conference"]} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" name="date" type="date" required />
            <Field label="Time" name="time" type="time" defaultValue="09:00" />
          </div>
          <Field label="Capacity" name="capacity" type="number" placeholder="500" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pricing" name="paid" options={["Free", "Paid"]} />
            <Field label="Price (₵)" name="price" type="number" placeholder="0" />
          </div>
        </ActionDialog>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Events" value={events.length} icon={CalendarDays} />
        <StatCard label="Total registered" value={totalRegistered} icon={Users} />
        <StatCard label="Paid events" value={events.filter((e) => e.paid).length} icon={Ticket} />
        <StatCard label="Free events" value={events.filter((e) => !e.paid).length} icon={Ticket} />
      </div>

      {events.length === 0 ? (
        <div className="mt-6 grid place-items-center rounded-2xl border border-dashed border-line py-20 text-center">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-line bg-surface text-ink-muted"><CalendarDays className="size-6" /></div>
          <h3 className="font-display text-lg font-semibold">No events yet</h3>
          <p className="mt-1 max-w-xs text-sm text-ink-muted">Create your first service, seminar or camp to start taking registrations.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => {
            const pct = e.capacity ? Math.round((e.registered / e.capacity) * 100) : 0;
            return (
              <Card key={e.id} hover className="flex flex-col p-5">
                <div className="mb-4 flex items-start justify-between">
                  <div className="grid size-14 place-items-center rounded-2xl border border-line bg-surface-2 text-center">
                    <span className="font-display text-lg font-bold leading-none">{new Date(e.date).getDate()}</span>
                    <span className="text-[10px] uppercase text-ink-faint">{formatDate(e.date, { month: "short", day: undefined, year: undefined })}</span>
                  </div>
                  {e.paid ? <Badge variant="gold">{formatCurrency(e.price ?? 0)}</Badge> : <Badge variant="success">Free</Badge>}
                </div>
                <h3 className="font-display text-lg font-semibold leading-snug">{e.title}</h3>
                <div className="mt-2 space-y-1 text-sm text-ink-muted">
                  <div className="flex items-center gap-2"><CalendarDays className="size-3.5 text-ink-faint" /> {formatDate(e.date)} · {e.time}</div>
                  <div className="flex items-center gap-2"><MapPin className="size-3.5 text-ink-faint" /> {e.branch}</div>
                </div>
                {e.registered > 0 && (
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs"><span className="text-ink-muted">{e.registered} registered</span><span className="text-ink-faint">{pct}% full</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-bright" style={{ width: `${pct}%` }} /></div>
                  </div>
                )}
                <div className="mt-4 flex gap-2 border-t border-line pt-4">
                  <Button size="sm" variant="secondary" className="flex-1"><Users className="size-4" /> Manage</Button>
                  <Button size="sm" variant="ghost"><QrCode className="size-4" /></Button>
                  {canDelete && (
                    <DeleteForm action={deleteEvent.bind(null, e.id)} confirm={`Delete "${e.title}"?`} successMessage="Event deleted" />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
