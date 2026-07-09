import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/page-hero";
import { PricingSection } from "@/components/marketing/pricing-section";
import { FAQ } from "@/components/marketing/faq";
import { FinalCTA } from "@/components/marketing/final-cta";
import { getPlatformConfig } from "@/lib/data/platform-config";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple, fair pricing in Ghana Cedi. Free forever for up to 50 members.",
};

export default async function PricingPage() {
  const platformConfig = await getPlatformConfig();
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title={
          <>
            Pricing that grows
            <br />
            <em className="font-light italic text-primary">with you.</em>
          </>
        }
        subtitle={`Start free forever. Upgrade when you're ready. No hidden fees, no surprises — all in ${platformConfig.currencySymbol}.`}
      />
      <PricingSection platformPricing={platformConfig} />
      <FAQ />
      <FinalCTA />
    </>
  );
}
