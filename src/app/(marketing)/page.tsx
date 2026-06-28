import { Hero } from "@/components/marketing/hero";
import { TrustBar } from "@/components/marketing/trust-bar";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { Spotlights } from "@/components/marketing/spotlights";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Testimonials } from "@/components/marketing/testimonials";
import { PricingSection } from "@/components/marketing/pricing-section";
import { FAQ } from "@/components/marketing/faq";
import { FinalCTA } from "@/components/marketing/final-cta";
import { getMarketingContent } from "@/lib/data/site-content";
import { getPlatformConfig } from "@/lib/data/platform-config";

export const revalidate = 3600;

export default async function HomePage() {
  const [content, platformConfig] = await Promise.all([
    getMarketingContent(),
    getPlatformConfig(),
  ]);
  return (
    <>
      <Hero subhead={content.heroSubhead} />
      <TrustBar />
      <FeatureGrid />
      <Spotlights />
      <HowItWorks />
      <Testimonials items={content.testimonials} />
      <PricingSection platformPricing={platformConfig} />
      <FAQ />
      <FinalCTA />
    </>
  );
}
