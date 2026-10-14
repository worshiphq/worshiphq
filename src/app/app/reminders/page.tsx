import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { getReminders } from "@/lib/data/modules";
import { db } from "@/lib/db";
import { RemindersClient } from "@/components/app/reminders-client";
import { absentMembers } from "@/lib/automations/absence";

export const metadata = { title: "Reminders" };

export default async function RemindersPage() {
  const session = await requireModule("reminders");
  const [data, departments, church] = await Promise.all([
    getReminders(session.churchId),
    db.department.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.church.findUnique({ where: { id: session.churchId }, select: { timezone: true, absenceOn: true, absenceWeeks: true, absenceTextMember: true, absenceAlertAdmins: true } }),
  ]);
  const away = await absentMembers(session.churchId, church?.absenceWeeks ?? 3, church?.timezone ?? "Africa/Accra");
  const absence = {
    on: church?.absenceOn ?? false,
    weeks: church?.absenceWeeks ?? 3,
    textMember: church?.absenceTextMember ?? true,
    alertAdmins: church?.absenceAlertAdmins ?? true,
    members: away.map((m) => ({ id: m.id, name: m.name, phone: m.phone, lastSeen: m.lastSeen.toISOString(), weeksAway: m.weeksAway, texted: m.texted, alerted: m.alerted, stale: m.stale })),
  };
  return <RemindersClient {...data} absence={absence} canWrite={canEdit(session, "reminders")} canDelete={session.canDelete && canEdit(session, "reminders")} departments={departments} />;
}
