import type { Metadata } from "next";
import { Heart, Globe2, ShieldCheck, Zap } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { FinalCTA } from "@/components/marketing/final-cta";
import { Reveal } from "@/components/ui/reveal";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "About",
  description: "Why we built WorshipHQ — a command center for the Church in Africa.",
};

const values = [
  { icon: Heart, title: "Ministry first", body: "Technology should serve the mission, never complicate it. Every feature earns its place by helping you shepherd people." },
  { icon: Globe2, title: "Built for Africa", body: "Mobile Money, SMS-first communication and offline-ready design — built around how churches in Ghana actually operate." },
  { icon: ShieldCheck, title: "Trust & stewardship", body: "Your data and your offerings are sacred. Bank-grade security, full audit trails and strict tenant isolation." },
  { icon: Zap, title: "Delightfully simple", body: "Powerful doesn't have to mean complicated. WorshipHQ is fast, beautiful and a joy to use on any device." },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About"
        title={
          <>
            A command center for the <span className="text-gradient">Church in Africa</span>
          </>
        }
        subtitle="We're on a mission to give every church — from the smallest fellowship to the largest ministry — the tools to manage, connect and grow."
      />

      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5">
          <Reveal className="space-y-5 text-lg leading-relaxed text-ink-muted">
            <p>
              Churches across {brand.region.country} do extraordinary work — often with spreadsheets,
              notebooks and a dozen WhatsApp groups. We believe ministry leaders deserve better tools:
              software as thoughtful and excellent as the work they do.
            </p>
            <p>
              {brand.name} brings people, giving, events and communications into one calm, beautiful
              headquarters — designed from the ground up for Mobile Money, intermittent internet and
              the realities of African church life.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="pb-16">
        <div className="mx-auto grid max-w-5xl gap-4 px-5 sm:grid-cols-2">
          {values.map((v, i) => (
            <Reveal key={v.title} delay={i * 0.08}>
              <div className="card-surface h-full p-7">
                <div className="mb-4 grid size-11 place-items-center rounded-xl border border-line bg-surface-2 text-primary-bright">
                  <v.icon className="size-5" />
                </div>
                <h3 className="font-display text-lg font-semibold">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{v.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <FinalCTA />
    </>
  );
}
