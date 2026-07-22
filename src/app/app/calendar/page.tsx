import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { CalendarClient } from "@/components/app/calendar-client";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const session = await requireModule("calendar");

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const [events, sessions, birthdays] = await Promise.all([
    db.event.findMany({
      where: { churchId: session.churchId, startsAt: { gte: start, lte: end } },
      select: { id: true, title: true, type: true, startsAt: true },
      orderBy: { startsAt: "asc" },
    }),
    db.attendanceSession.findMany({
      where: { churchId: session.churchId, date: { gte: start, lte: end } },
      select: { id: true, serviceName: true, date: true },
      orderBy: { date: "asc" },
    }),
    db.person.findMany({
      where: { churchId: session.churchId, birthday: { not: null } },
      select: { firstName: true, lastName: true, birthday: true },
    }),
  ]);

  const calendarEvents = [
    ...events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.startsAt.toISOString(),
      type: "event" as const,
      color: e.type === "Service" ? "brand" as const : "info" as const,
    })),
    ...sessions.map((s) => ({
      id: s.id,
      title: s.serviceName,
      date: s.date.toISOString(),
      type: "attendance" as const,
      color: "success" as const,
    })),
    ...birthdays
      .filter((b) => b.birthday)
      .map((b) => {
        const [m, d] = b.birthday!.split("-").map(Number);
        const thisYear = new Date(now.getFullYear(), m - 1, d);
        return {
          id: `bday-${b.firstName}-${b.lastName}`,
          title: `${b.firstName} ${b.lastName}'s birthday`,
          date: thisYear.toISOString(),
          type: "birthday" as const,
          color: "warning" as const,
        };
      })
      .filter((b) => {
        const d = new Date(b.date);
        return d >= start && d <= end;
      }),
  ];

  return (
    <div>
      <PageHeader title="Calendar" description="View events, services, and birthdays at a glance." />
      <CalendarClient events={calendarEvents} />
    </div>
  );
}
