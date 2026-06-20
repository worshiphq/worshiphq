import { requireModule } from "@/lib/auth";
import { getGiving, getTitheData } from "@/lib/data/giving";
import { GivingClient } from "@/components/app/giving-client";
import { TitheClient } from "@/components/app/tithe-client";
import { GivingLinkCard } from "@/components/app/giving-link-card";
import { PageTips } from "@/components/app/page-tips";
import { db } from "@/lib/db";

export const metadata = { title: "Giving" };

export default async function GivingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireModule("giving");
  const params = await searchParams;

  const now = new Date();
  const titheYear = Number(params.titheYear) || now.getFullYear();
  const rawMonth = params.titheMonth != null ? Number(params.titheMonth) : NaN;
  const validMonth = rawMonth >= 0 && rawMonth <= 11 ? rawMonth : now.getMonth();

  const [data, church, titheData] = await Promise.all([
    getGiving(session.churchId),
    db.church.findUnique({ where: { id: session.churchId }, select: { slug: true, isDemo: true } }),
    getTitheData(session.churchId, titheYear, validMonth),
  ]);

  const tab = params.tab;

  return (
    <div className="space-y-5">
      <PageTips
        tourId="giving"
        steps={[
          { target: "giving-link", title: "Online & Mobile Money giving", body: "Share this link or QR so members give from their phones — gifts and receipts are recorded automatically." },
          { target: "giving-body", title: "Track every gift", body: "Record offerings, see giving by fund, and watch your monthly trend. Add a Paystack key to take live MoMo." },
          { target: "tithe-body", title: "Tithe recording", body: "Select members after service, enter tithe amounts, and send SMS receipts — all in one batch. View weekly & monthly records." },
        ]}
      />
      {church && !church.isDemo && (
        <div data-tour="giving-link">
          <GivingLinkCard slug={church.slug} />
        </div>
      )}
      <div data-tour="giving-body">
        <GivingClient {...data} canWrite={!session.isDemo} canDelete={session.canDelete && !session.isDemo} />
      </div>
      <div data-tour="tithe-body">
        <TitheClient
          {...titheData}
          canWrite={!session.isDemo}
        />
      </div>
    </div>
  );
}
