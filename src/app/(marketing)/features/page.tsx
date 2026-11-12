import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/page-hero";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { Spotlights } from "@/components/marketing/spotlights";
import { FinalCTA } from "@/components/marketing/final-cta";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { lowerFirst } from "@/lib/utils";
import { marketingTiers } from "@/lib/marketing-tiers";

export const metadata: Metadata = {
  title: "Features",
  description: "Every tool your church needs - people, giving, events, communications and more.",
};

export default async function FeaturesPage() {
  const platformConfig = await getPlatformConfig();
  return (
    <>
      <PageHero
        eyebrow="Features"
        title={
          <>
            One platform for your
            <br />
            <span className="text-primary">whole ministry.</span>
          </>
        }
        subtitle="From the first-time visitor to the device at the door. Start free and add what your church needs, one plan at a time."
      />
      <FeatureGrid {...marketingTiers(platformConfig.planTable)} />
      <Spotlights />
      <FinalCTA freeMembers={lowerFirst(platformConfig.planDefs.free.membersLabel)} />
    </>
  );
}
