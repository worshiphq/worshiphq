import { requireSession } from "@/lib/auth";
import { getGiving } from "@/lib/data/giving";
import { GivingClient } from "@/components/app/giving-client";
import { GivingLinkCard } from "@/components/app/giving-link-card";
import { db } from "@/lib/db";

export const metadata = { title: "Giving" };

export default async function GivingPage() {
  const session = await requireSession();
  const [data, church] = await Promise.all([
    getGiving(session.churchId),
    db.church.findUnique({ where: { id: session.churchId }, select: { slug: true, isDemo: true } }),
  ]);
  return (
    <div className="space-y-5">
      {church && !church.isDemo && <GivingLinkCard slug={church.slug} />}
      <GivingClient {...data} canWrite={!session.isDemo} />
    </div>
  );
}
