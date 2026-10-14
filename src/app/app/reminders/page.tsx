import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { getReminders } from "@/lib/data/modules";
import { db } from "@/lib/db";
import { RemindersClient } from "@/components/app/reminders-client";

export const metadata = { title: "Reminders" };

export default async function RemindersPage() {
  const session = await requireModule("reminders");
  const [data, departments] = await Promise.all([
    getReminders(session.churchId),
    db.department.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return <RemindersClient {...data} canWrite={canEdit(session, "reminders")} canDelete={session.canDelete && canEdit(session, "reminders")} departments={departments} />;
}
