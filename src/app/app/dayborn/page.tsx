import { requireModule } from "@/lib/auth";
import { getDayBornData } from "@/lib/data/dayborn";
import { DayBornClient } from "@/components/app/dayborn-client";

export const metadata = { title: "Day Born" };

export default async function DayBornPage() {
  const session = await requireModule("dayborn");
  const data = await getDayBornData(session.churchId);

  return (
    <DayBornClient
      {...data}
      canWrite={!session.isDemo}
      canDelete={session.canDelete && !session.isDemo}
    />
  );
}
