"use client";

import { motion } from "motion/react";
import { Reveal } from "@/components/ui/reveal";
import { steps } from "@/config/marketing";

export function HowItWorks() {
  return (
    <section className="relative overflow-hidden py-28">
      {/* Background accent */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-surface-2/30 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5">
        <Reveal>
          <div className="flex items-end justify-between gap-8">
            <div className="max-w-xl">
              <span className="mb-3 inline-block font-mono text-xs font-medium uppercase tracking-[0.2em] text-gold">
                06 / Getting started
              </span>
              <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
                From chaos to clarity.
                <br />
                <span className="text-ink-muted">In one afternoon.</span>
              </h2>
            </div>
          </div>
        </Reveal>

        <div className="relative mt-16 grid gap-6 md:grid-cols-3">
          {/* Connecting line — more refined */}
          <div className="absolute left-0 right-0 top-[3.25rem] hidden md:block">
            <div className="mx-16 h-px bg-gradient-to-r from-primary/20 via-gold/15 to-primary/20" />
          </div>

          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.15}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ duration: 0.25 }}
                className="group relative h-full rounded-2xl border border-line bg-surface p-7 transition-colors duration-300 hover:border-primary/20"
              >
                {/* Step number — large, muted background element */}
                <div className="relative mb-6">
                  <span className="absolute -left-1 -top-2 font-display text-6xl font-bold text-ink/[0.04]">
                    {s.n}
                  </span>
                  <div className="relative flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 font-display text-lg font-bold text-primary-bright transition-colors duration-300 group-hover:border-primary/40 group-hover:from-primary/15">
                    {s.n}
                  </div>
                </div>

                <h3 className="font-display text-xl font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{s.body}</p>

                {/* Bottom line accent */}
                <div className="absolute bottom-0 left-7 right-7 h-px scale-x-0 bg-gradient-to-r from-transparent via-primary/25 to-transparent transition-transform duration-500 group-hover:scale-x-100" />
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
