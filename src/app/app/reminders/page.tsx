import { requireModule } from "@/lib/auth";
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
  return <RemindersClient {...data} canWrite={!session.isDemo} canDelete={session.canDelete && !session.isDemo} departments={departments} />;
}
