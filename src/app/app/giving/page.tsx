import { requireModule } from "@/lib/auth";
import { getGiving, getTitheData } from "@/lib/data/giving";
import { getAccountOptions } from "@/lib/data/accounts";
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

  // The activity list has its own period + kind + page (gy / gm / gk / gp).
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const gy = parseInt(one(params.gy), 10);
  const gm = parseInt(one(params.gm), 10);
  const gk = one(params.gk);
  const givingYear = Number.isFinite(gy) && gy > 1990 && gy < 2200 ? gy : now.getFullYear();
  const givingMonth = Number.isFinite(gm) && gm >= 0 && gm <= 11 ? gm : now.getMonth();
  const givingKind = (["tithes", "offertory", "other"] as const).find((k) => k === gk) ?? "all";
  const givingPage = Math.max(1, parseInt(one(params.gp), 10) || 1);

  const [data, church, titheData, accounts, funds] = await Promise.all([
    getGiving(session.churchId, { year: givingYear, month: givingMonth, kind: givingKind, page: givingPage }),
    db.church.findUnique({ where: { id: session.churchId }, select: { slug: true, isDemo: true, titheReceiptTemplate: true } }),
    getTitheData(session.churchId, givingYear, givingMonth),
    getAccountOptions(session.churchId),
    db.fund.findMany({ where: { churchId: session.churchId }, select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  // Custom funds already used (excluding the built-in Tithes/Offertory) - for reuse.
  const customFunds = [...new Set(funds.map((f) => f.name).filter((n) => !/^(tithes?|offertory)$/i.test(n.trim())))];

  const tab = params.tab;

  return (
    <div className="space-y-5">
      <PageTips
        tourId="giving"
        steps={[
          { target: "giving-link", title: "Online & Mobile Money giving", body: "Share this link or QR so members give from their phones - gifts and receipts are recorded automatically." },
          { target: "giving-body", title: "Track every gift", body: "Record offerings, see giving by fund, and watch your monthly trend. Add a Paystack key to take live MoMo." },
          { target: "tithe-body", title: "Tithe recording", body: "Select members after service, enter tithe amounts, and send SMS receipts - all in one batch. View weekly & monthly records." },
        ]}
      />
      {church && !church.isDemo && (
        <div data-tour="giving-link">
          <GivingLinkCard slug={church.slug} />
        </div>
      )}
      <div data-tour="giving-body">
        <GivingClient {...data} accounts={accounts} canWrite={!session.isDemo} canDelete={session.canDelete && !session.isDemo} />
      </div>
      <div data-tour="tithe-body">
        <TitheClient
          {...titheData}
          accounts={accounts}
          canWrite={!session.isDemo}
          titheTemplate={church?.titheReceiptTemplate ?? null}
          customFunds={customFunds}
        />
      </div>
    </div>
  );
}
