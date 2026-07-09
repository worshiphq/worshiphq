"use client";

import { Reveal, StaggerGroup, StaggerItem } from "@/components/ui/reveal";
import { steps } from "@/config/marketing";

export function HowItWorks() {
  return (
    <section className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <div className="relative overflow-hidden bg-evergreen-deep px-6 py-16 text-parchment sm:px-14 sm:py-20">
            {/* Fine gold rules top & bottom, like gilt edges */}
            <div className="absolute inset-x-6 top-4 h-px bg-brass/40 sm:inset-x-10" aria-hidden />
            <div className="absolute inset-x-6 top-6 h-px bg-brass/20 sm:inset-x-10" aria-hidden />
            <div className="absolute inset-x-6 bottom-4 h-px bg-brass/40 sm:inset-x-10" aria-hidden />
            <div className="absolute inset-x-6 bottom-6 h-px bg-brass/20 sm:inset-x-10" aria-hidden />

            {/* Faint radial light, like a sanctuary lamp */}
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{ background: "radial-gradient(70% 50% at 50% 0%, rgba(151,116,42,0.18) 0%, transparent 70%)" }}
              aria-hidden
            />

            <div className="relative">
              <div className="mx-auto max-w-xl text-center">
                <p className="rubric !text-brass">Getting started</p>
                <h2 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
                  From chaos to clarity,
                  <br />
                  <span className="text-brass">in one afternoon.</span>
                </h2>
              </div>

              <StaggerGroup className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8" stagger={0.12}>
                {steps.map((s, i) => (
                  <StaggerItem key={s.n}>
                    <div className="relative border-t border-parchment/20 pt-6 text-center md:text-left">
                      {/* Step numeral */}
                      <span className="font-display text-5xl font-bold text-brass/80">{s.n}</span>
                      <h3 className="mt-4 font-display text-xl font-bold text-parchment">{s.title}</h3>
                      <p className="mt-2.5 text-sm leading-[1.8] text-parchment/70">{s.body}</p>
                      {i < steps.length - 1 && (
                        <span className="absolute -right-5 top-10 hidden text-lg text-brass/50 md:block" aria-hidden>
                          →
                        </span>
                      )}
                    </div>
                  </StaggerItem>
                ))}
              </StaggerGroup>

              <p className="mt-14 text-center text-sm text-parchment/50">
                ✦ &nbsp; Your first fifty members are free, forever. &nbsp; ✦
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
