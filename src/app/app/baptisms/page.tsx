import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { getBaptisms } from "@/app/actions/baptisms";
import { BaptismsClient } from "@/components/app/baptisms-client";

export const metadata = { title: "Baptisms" };

export default async function BaptismsPage() {
  const session = await requireModule("people");
  const data = await getBaptisms();
  return <BaptismsClient data={{ ...data, canWrite: canEdit(session, "people") && !session.isDemo }} />;
}
