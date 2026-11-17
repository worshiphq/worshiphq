import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { pageMeta } from "@/lib/seo/meta";
import { JsonLd, faqLd, organizationLd, softwareLd, websiteLd } from "@/lib/seo/json-ld";
import { TrustBar } from "@/components/marketing/trust-bar";
import { Marquee } from "@/components/marketing/marquee";
import { SundayStory } from "@/components/marketing/sunday-story";
import { DevicesCallout } from "@/components/marketing/devices-callout";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { Spotlights } from "@/components/marketing/spotlights";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Testimonials } from "@/components/marketing/testimonials";
import { FAQ } from "@/components/marketing/faq";
import { FinalCTA } from "@/components/marketing/final-cta";
import { getMarketingContent } from "@/lib/data/site-content";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { getRealStats, landingStats } from "@/lib/data/landing-stats";
import { marketingTiers } from "@/lib/marketing-tiers";
import { lowerFirst } from "@/lib/utils";

const HOME_DESCRIPTION =
  "Church management software for Ghana. Members check in at the door with their face, palm or fingerprint, and WorshipHQ handles members, tithes and offerings, Mobile Money giving, SMS and accounting. Free plan to start.";

export const metadata: Metadata = pageMeta({
  title: "Church Management Software in Ghana with Biometric Check-in | WorshipHQ",
  description: HOME_DESCRIPTION,
  path: "/",
  absoluteTitle: true,
});

// Rebuilt at most once an hour: the numbers and plan details stay current without any work per visitor.
export const revalidate = 3600;

export default async function HomePage() {
  const [content, platformConfig, real] = await Promise.all([getMarketingContent(), getPlatformConfig(), getRealStats()]);
  const freeMembers = lowerFirst(platformConfig.planDefs.free.membersLabel);

  const { tiers, members } = marketingTiers(platformConfig.planTable);
  const stats = landingStats(real, content.stats);

  const starterPrice = `${platformConfig.currencySymbol}${platformConfig.prices.starter?.monthly ?? 10}`;

  return (
    <>
      <JsonLd data={[organizationLd(), websiteLd(), softwareLd(HOME_DESCRIPTION), faqLd(starterPrice, freeMembers)]} />
      <Hero subhead={content.heroSubhead} freeMembers={freeMembers} stats={stats} />
      <Marquee />
      <TrustBar stats={stats} />
      <SundayStory tiers={tiers} />
      <DevicesCallout />
      <FeatureGrid tiers={tiers} members={members} />
      <Spotlights />
      <HowItWorks freeMemberLimit={platformConfig.planDefs.free.memberLimit} />
      <Testimonials items={content.testimonials} />
      <FAQ
        starterPrice={starterPrice}
        freeMembers={freeMembers}
      />
      <FinalCTA freeMembers={freeMembers} />
    </>
  );
}
