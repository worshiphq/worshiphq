import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/page-hero";
import { PricingSection } from "@/components/marketing/pricing-section";
import { FAQ } from "@/components/marketing/faq";
import { FinalCTA } from "@/components/marketing/final-cta";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple, fair pricing in Ghana Cedi. Free forever for up to 50 members.",
};

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title={
          <>
            Pricing that <span className="text-gradient">grows with you</span>
          </>
        }
        subtitle="Start free forever. Upgrade when you're ready. No hidden fees, no surprises — all in ₵."
      />
      <PricingSection />
      <FAQ />
      <FinalCTA />
    </>
  );
}
