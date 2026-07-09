import type { Metadata } from "next";
import { Heart, Globe2, ShieldCheck, Zap } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { FinalCTA } from "@/components/marketing/final-cta";
import { Reveal } from "@/components/ui/reveal";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "About",
  description: "Why we built WorshipHQ — a command center for your church.",
};

const values = [
  { icon: Heart, title: "Ministry first", body: "Technology should serve the mission, never complicate it. Every feature earns its place by helping you shepherd people." },
  { icon: Globe2, title: "Built for every church", body: "Mobile Money, SMS broadcasts, online giving and offline-ready design — built around how churches actually operate, wherever they are." },
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
            A well-kept house for
            <br />
            <span className="text-primary">your church.</span>
          </>
        }
        subtitle="We're on a mission to give every church — from the smallest fellowship to the largest ministry — the tools to manage, connect and grow."
      />

      {/* ── Manifesto ── */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-2xl px-5">
          <Reveal>
            <p className="dropcap text-lg leading-[1.9] text-ink-muted">
              Churches everywhere do extraordinary work — often with spreadsheets,
              notebooks and a dozen WhatsApp groups. We believe ministry leaders
              deserve better tools: software as thoughtful and excellent as the
              work they do.
            </p>
            <div className="ornament-divider mx-auto my-8 max-w-[12rem] text-xs">✦</div>
            <p className="text-lg leading-[1.9] text-ink-muted">
              {brand.name} brings people, giving, events and communications into
              one calm, beautiful headquarters — designed from the ground up for
              Mobile Money, online giving and the realities of church life.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Values, set as articles of faith ── */}
      <section className="pb-20">
        <div className="mx-auto max-w-4xl px-5">
          <Reveal>
            <p className="rubric border-t-2 border-evergreen pt-8">What we hold to</p>
          </Reveal>
          <div className="mt-10 grid gap-x-14 gap-y-12 sm:grid-cols-2">
            {values.map((v, i) => (
              <Reveal key={v.title} delay={i * 0.08}>
                <article className="border-t border-ink/10 pt-5">
                  <div className="grid size-10 place-items-center border border-evergreen/20 bg-evergreen/5 text-evergreen">
                    <v.icon className="size-4" strokeWidth={1.75} />
                  </div>
                  <h3 className="mt-4 font-display text-2xl font-bold text-evergreen-deep">{v.title}</h3>
                  <p className="mt-3 text-[15px] leading-[1.8] text-ink-muted">{v.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <FinalCTA />
    </>
  );
}
