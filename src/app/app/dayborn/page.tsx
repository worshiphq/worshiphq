import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { getDayBornData } from "@/lib/data/dayborn";
import { getAccountOptions } from "@/lib/data/accounts";
import { DayBornClient } from "@/components/app/dayborn-client";

export const metadata = { title: "Day Born" };

export default async function DayBornPage() {
  const session = await requireModule("dayborn");
  const [data, accounts] = await Promise.all([
    getDayBornData(session.churchId),
    getAccountOptions(session.churchId),
  ]);

  return (
    <DayBornClient
      {...data}
      accounts={accounts}
      canWrite={canEdit(session, "dayborn")}
      canDelete={session.canDelete && canEdit(session, "dayborn")}
    />
  );
}
