import { requireSession } from "@/lib/auth";
import { getGiving } from "@/lib/data/giving";
import { GivingClient } from "@/components/app/giving-client";
import { GivingLinkCard } from "@/components/app/giving-link-card";
import { PageTips } from "@/components/app/page-tips";
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
      <PageTips
        tourId="giving"
        steps={[
          { target: "giving-link", title: "Online & Mobile Money giving", body: "Share this link or QR so members give from their phones — gifts and receipts are recorded automatically." },
          { target: "giving-body", title: "Track every gift", body: "Record offerings, see giving by fund, and watch your monthly trend. Add a Paystack key to take live MoMo." },
        ]}
      />
      {church && !church.isDemo && (
        <div data-tour="giving-link">
          <GivingLinkCard slug={church.slug} />
        </div>
      )}
      <div data-tour="giving-body">
        <GivingClient {...data} canWrite={!session.isDemo} />
      </div>
    </div>
  );
}
