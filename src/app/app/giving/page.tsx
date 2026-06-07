import { requireSession } from "@/lib/auth";
import { getGiving } from "@/lib/data/giving";
import { GivingClient } from "@/components/app/giving-client";

export const metadata = { title: "Giving" };

export default async function GivingPage() {
  const session = await requireSession();
  const data = await getGiving(session.churchId);
  return <GivingClient {...data} canWrite={!session.isDemo} />;
}
