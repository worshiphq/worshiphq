import { requireSuperAdminOwner } from "@/lib/auth";
import { getMoneyView, type Ledger } from "@/lib/money/owner-ledger";
import { MoneyClient } from "@/components/admin/money-client";
import { ClearAccessLog } from "@/components/admin/clear-access-log";

// Its own manifest, so "Add to home screen" installs this as a separate app opening straight on
// the money page rather than the church dashboard.
export const metadata = {
  title: "Money",
  robots: { index: false, follow: false },
  manifest: "/money.webmanifest",
  themeColor: "#0c1116",
};
export const dynamic = "force-dynamic";

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ book?: string }> }) {
  // Owner only. An admin SuperAdmin (the partner) gets the same refusal as a stranger.
  await requireSuperAdminOwner();

  const { book } = await searchParams;
  const ledger: Ledger = book === "personal" ? "personal" : "site";
  const [site, personal] = await Promise.all([getMoneyView("site"), getMoneyView("personal")]);

  return (
    <>
      <MoneyClient
        ledger={ledger}
        site={{ ...site, earned: site.earned.slice(0, 60) }}
        personal={{ ...personal, earned: [] }}
      />
      {/* This page refuses everyone but the owner, so the button is the owner's alone. */}
      <div className="flex justify-end bg-[#0c1116] px-4 py-6">
        <ClearAccessLog />
      </div>
    </>
  );
}
