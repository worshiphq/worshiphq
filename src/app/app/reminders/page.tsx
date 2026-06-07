import { requireSession } from "@/lib/auth";
import { getReminders } from "@/lib/data/modules";
import { RemindersClient } from "@/components/app/reminders-client";

export const metadata = { title: "Reminders" };

export default async function RemindersPage() {
  const session = await requireSession();
  const data = await getReminders(session.churchId);
  return <RemindersClient {...data} canWrite={!session.isDemo} />;
}
