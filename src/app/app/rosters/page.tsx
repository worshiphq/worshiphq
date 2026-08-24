import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { getServiceRoles } from "@/lib/data/rosters";
import { getSmsBalance } from "@/lib/sms/credits";
import { RostersClient } from "@/components/app/rosters-client";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Rosters" };

export default async function RostersPage() {
  const session = await requireModule("volunteers");

  const [sheets, members, roles, smsBalance, church] = await Promise.all([
    db.volunteerRoster.findMany({
      where: { churchId: session.churchId },
      orderBy: { startDate: "desc" },
      include: {
        slots: {
          orderBy: { createdAt: "asc" },
          include: { person: { select: { firstName: true, lastName: true, phone: true } } },
        },
      },
    }),
    db.person.findMany({
      where: { churchId: session.churchId, status: { not: "inactive" } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, phone: true },
    }),
    getServiceRoles(session.churchId),
    getSmsBalance(session.churchId),
    db.church.findUnique({
      where: { id: session.churchId },
      select: {
        messageTemplates: true, timezone: true, rosterAnnounceOn: true, rosterAnnounceAudience: true,
        rosterAnnounceGroupId: true, rosterAnnounceLeadDays: true, rosterAnnounceHour: true, rosterAnnounceMinute: true, rosterAnnounceWeekday: true,
        rosterRemindOn: true, rosterRemindLeadDays: true, rosterRemindHour: true, rosterRemindMinute: true, rosterRemindWeekday: true,
      },
    }),
  ]);
  const messageTemplates = (church?.messageTemplates as Record<string, string> | null) ?? {};
  const groups = await db.group.findMany({
    where: { churchId: session.churchId },
    select: { id: true, name: true, _count: { select: { members: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Rosters"
        description="Set who serves at each service — Word, prayer, praise & worship — then share it or text everyone their duty."
      />

      <RostersClient
        sheets={sheets.map((s) => {
          // Group this roster's slots by service + day.
          const groups = new Map<string, {
            service: string; date: string; time: string;
            assignments: { id: string; role: string; personId: string | null; personName: string | null; hasPhone: boolean; notified: boolean }[];
          }>();
          for (const sl of s.slots) {
            const dayKey = sl.date.toISOString().slice(0, 10);
            const key = `${sl.service ?? ""}|${dayKey}`;
            const hh = sl.date.getUTCHours();
            const mm = sl.date.getUTCMinutes();
            const time = hh === 0 && mm === 0 ? "" : `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
            if (!groups.has(key)) groups.set(key, { service: sl.service ?? "Service", date: sl.date.toISOString(), time, assignments: [] });
            groups.get(key)!.assignments.push({
              id: sl.id,
              role: sl.role,
              personId: sl.personId,
              personName: sl.personName ?? (sl.person ? `${sl.person.firstName} ${sl.person.lastName}` : null),
              hasPhone: !!sl.person?.phone,
              notified: !!sl.notifiedAt,
            });
          }
          const services = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
          return {
            id: s.id,
            name: s.name,
            announceLeadDays: s.announceLeadDays,
            announceHour: s.announceHour,
            announceMinute: s.announceMinute,
            announceWeekday: s.announceWeekday,
            services,
          };
        })}
        members={members.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}`.trim(), hasPhone: !!m.phone }))}
        roles={roles}
        smsBalance={smsBalance}
        messageTemplates={messageTemplates}
        groups={groups.map((g) => ({ id: g.id, name: g.name, memberCount: g._count.members }))}
        announce={{
          on: church?.rosterAnnounceOn ?? false,
          audience: church?.rosterAnnounceAudience ?? "group",
          groupId: church?.rosterAnnounceGroupId ?? null,
          leadDays: church?.rosterAnnounceLeadDays ?? 2,
          hour: church?.rosterAnnounceHour ?? 8,
          minute: church?.rosterAnnounceMinute ?? 0,
          weekday: church?.rosterAnnounceWeekday ?? null,
          timezone: church?.timezone ?? "Africa/Accra",
        }}
        remind={{
          on: church?.rosterRemindOn ?? false,
          leadDays: church?.rosterRemindLeadDays ?? 1,
          hour: church?.rosterRemindHour ?? 18,
          minute: church?.rosterRemindMinute ?? 0,
          weekday: church?.rosterRemindWeekday ?? null,
        }}
        canWrite={!session.isDemo}
      />
    </div>
  );
}
