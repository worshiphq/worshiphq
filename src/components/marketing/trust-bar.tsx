"use client";

import { motion } from "motion/react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Reveal } from "@/components/ui/reveal";

const stats = [
  { label: "Churches onboarded", value: 480, suffix: "+" },
  { label: "Members managed", value: 320000, suffix: "+" },
  { label: "Giving processed", value: 14, prefix: "₵", suffix: "M+" },
  { label: "Messages delivered", value: 2.4, suffix: "M+", decimals: 1 },
];

export function TrustBar() {
  return (
    <section className="relative py-20">
      {/* Top divider line with diamond accent */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-center">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-line" />
        <div className="mx-3 size-1.5 rotate-45 border border-line bg-surface" />
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-line" />
      </div>

      <div className="mx-auto max-w-5xl px-5">
        <Reveal className="mb-12 text-center">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink-faint">
            Trusted by ministries across Ghana
          </span>
        </Reveal>

        <div className="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-10">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.1}>
              <motion.div
                whileHover={{ y: -2 }}
                className="group text-center"
              >
                <div className="font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
                  <AnimatedNumber
                    value={s.value}
                    prefix={s.prefix}
                    suffix={s.suffix}
                    decimals={s.decimals ?? 0}
                  />
                </div>
                <div className="mt-2 text-sm text-ink-muted">{s.label}</div>
                {/* Accent bar */}
                <div className="mx-auto mt-3 h-0.5 w-8 rounded-full bg-gradient-to-r from-primary/40 to-gold/40 transition-all duration-300 group-hover:w-12" />
              </motion.div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.3} className="mt-8 text-center">
          <p className="text-[10px] italic text-ink-faint">Figures are illustrative</p>
        </Reveal>
      </div>

      {/* Bottom divider */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-line" />
        <div className="mx-3 size-1.5 rotate-45 border border-line bg-surface" />
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-line" />
      </div>
    </section>
  );
}
