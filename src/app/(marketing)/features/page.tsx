import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/page-hero";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { Spotlights } from "@/components/marketing/spotlights";
import { FinalCTA } from "@/components/marketing/final-cta";

export const metadata: Metadata = {
  title: "Features",
  description: "Every tool your church needs — people, giving, events, communications and more.",
};

export default function FeaturesPage() {
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
        subtitle="From the first-time visitor to the year-end statement — WorshipHQ handles it all, beautifully."
      />
      <FeatureGrid />
      <Spotlights />
      <FinalCTA />
    </>
  );
}
