import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { getReminders } from "@/lib/data/modules";
import { db } from "@/lib/db";
import { RemindersClient } from "@/components/app/reminders-client";
import { absentMembers } from "@/lib/automations/absence";

export const metadata = { title: "Reminders" };

export default async function RemindersPage() {
  const session = await requireModule("reminders");
  const [data, departments, church, team] = await Promise.all([
    getReminders(session.churchId),
    db.department.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.church.findUnique({ where: { id: session.churchId }, select: { timezone: true, absenceOn: true, absenceWeeks: true, absenceTextMember: true, absenceAlertAdmins: true, absenceMaxTexts: true, absenceRepeatWeeks: true, absenceCreateFollowUp: true, absenceNotifyUserIds: true, autoInactiveOn: true, autoInactiveWeeks: true } }),
    db.user.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
  ]);
  const away = await absentMembers(session.churchId, church?.absenceWeeks ?? 3, church?.timezone ?? "Africa/Accra");
  const absence = {
    on: church?.absenceOn ?? false,
    weeks: church?.absenceWeeks ?? 3,
    textMember: church?.absenceTextMember ?? true,
    alertAdmins: church?.absenceAlertAdmins ?? true,
    maxTexts: church?.absenceMaxTexts ?? 1,
    repeatWeeks: church?.absenceRepeatWeeks ?? 2,
    createFollowUp: church?.absenceCreateFollowUp ?? false,
    notifyUserIds: church?.absenceNotifyUserIds ?? [],
    team: team.map((u) => ({ id: u.id, name: u.name, role: String(u.role) })),
    members: away.map((m) => ({ id: m.id, name: m.name, phone: m.phone, lastSeen: m.lastSeen.toISOString(), weeksAway: m.weeksAway, texted: m.texted, textCount: m.textCount, alerted: m.alerted, stale: m.stale })),
  };
  // The attendance based check replaces the older "We miss you" reminder, which is now retired.
  const shown = { ...data, automations: data.automations.filter((a) => a.trigger !== "lapsed") };
  const autoInactive = {
    on: church?.autoInactiveOn ?? false,
    weeks: church?.autoInactiveWeeks ?? 12,
    // Max only. The server refuses below it too; this just lets the card say so.
    locked: !session.isDemo && !!session.planLocked?.includes("auto-inactive"),
  };
  // Reminders (birthdays, absence texts) are Starter; the automations beside them are Pro. The server
  // refuses automation changes below Pro, so this only lets the screen say so instead of failing.
  const automationsLocked = !session.isDemo && !!session.planLocked?.includes("automations");
  return <RemindersClient {...shown} absence={absence} canWrite={canEdit(session, "reminders")} canDelete={session.canDelete && canEdit(session, "reminders")} departments={departments} automationsLocked={automationsLocked} autoInactive={autoInactive} />;
}
