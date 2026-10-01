import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/page-hero";
import { PricingSection } from "@/components/marketing/pricing-section";
import { FAQ } from "@/components/marketing/faq";
import { FinalCTA } from "@/components/marketing/final-cta";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { lowerFirst } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  // No member count here - it's SuperAdmin-editable and would drift out of sync
  // with the real limit shown on the page itself (see FAQ below).
  description: "Simple, fair pricing in Ghana Cedi. Free forever to get started.",
};

export default async function PricingPage() {
  const platformConfig = await getPlatformConfig();
  const freeMembers = lowerFirst(platformConfig.planDefs.free.membersLabel);
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title={
          <>
            Pricing that grows
            <br />
            <span className="text-primary">with you.</span>
          </>
        }
        subtitle="Start free forever. Upgrade when you're ready - no hidden fees, no surprises."
      />
      <PricingSection platformPricing={platformConfig} />
      <FAQ
        starterPrice={`${platformConfig.currencySymbol}${platformConfig.prices.starter?.monthly ?? 10}`}
        freeMembers={freeMembers}
      />
      <FinalCTA freeMembers={freeMembers} />
    </>
  );
}
