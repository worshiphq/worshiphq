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
            <span className="text-primary">with you.</span>
          </>
        }
        subtitle="Start free forever. Upgrade when you're ready. Prices in US dollars — billed in Ghana Cedi via Paystack."
      />
      <PricingSection platformPricing={platformConfig} />
      <FAQ starterPrice={`${platformConfig.currencySymbol}${platformConfig.prices.starter?.monthly ?? 10}`} />
      <FinalCTA />
    </>
  );
}
