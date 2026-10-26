import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { getBaptisms } from "@/app/actions/baptisms";
import { BaptismsClient } from "@/components/app/baptisms-client";

export const metadata = { title: "Baptisms" };

export default async function BaptismsPage() {
  const session = await requireModule("people");
  // Baptisms is a plan feature: a church whose plan does not include it goes to the upgrade page, like a locked menu item.
  if (session.planLocked?.includes("baptisms")) redirect("/app/settings?tab=billing");
  const data = await getBaptisms();
  return <BaptismsClient data={{ ...data, canWrite: canEdit(session, "people") && !session.isDemo }} />;
}
