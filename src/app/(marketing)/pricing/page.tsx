import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/meta";
import { JsonLd, breadcrumbLd, faqLd } from "@/lib/seo/json-ld";
import { PageHero } from "@/components/marketing/page-hero";
import { PricingSection } from "@/components/marketing/pricing-section";
import { LivePrices } from "@/components/marketing/live-page";
import { FAQ } from "@/components/marketing/faq";
import { FinalCTA } from "@/components/marketing/final-cta";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { lowerFirst } from "@/lib/utils";

export const metadata: Metadata = pageMeta({
  title: "Pricing in Ghana Cedi",
  description: "Simple church software pricing in Ghana Cedi, paid by Mobile Money or card. Start free forever and upgrade when your church is ready.",
  path: "/pricing",
});

export default async function PricingPage() {
  const platformConfig = await getPlatformConfig();
  const freeMembers = lowerFirst(platformConfig.planDefs.free.membersLabel);
  const starterPrice = `${platformConfig.currencySymbol}${platformConfig.prices.starter?.monthly ?? 10}`;
  return (
    <>
      <JsonLd data={[faqLd(starterPrice, freeMembers), breadcrumbLd([{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }])]} />
      <PageHero
        photo="pricing"
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
      {platformConfig.promotions.launch.on && <LivePrices promotions={platformConfig.promotions} link />}
      <FAQ
        starterPrice={starterPrice}
        freeMembers={freeMembers}
      />
      <FinalCTA freeMembers={freeMembers} />
    </>
  );
}
