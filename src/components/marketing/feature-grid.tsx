"use client";

import { motion } from "motion/react";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/ui/reveal";
import { featureCards } from "@/config/marketing";
import { cn } from "@/lib/utils";

export function FeatureGrid() {
  return (
    <section id="features" className="relative py-24 overflow-hidden">
      {/* Subtle diagonal line accent */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute right-0 top-0 h-px w-[40%] bg-gradient-to-l from-transparent via-line to-transparent" />
        <div className="absolute left-0 bottom-0 h-px w-[30%] bg-gradient-to-r from-transparent via-line to-transparent" />
      </div>

      <div className="mx-auto max-w-6xl px-5">
        {/* ── Section header — editorial style, left-aligned ── */}
        <Reveal>
          <div className="flex items-end justify-between gap-8">
            <div className="max-w-2xl">
              <span className="mb-3 inline-block font-mono text-xs font-medium uppercase tracking-[0.2em] text-primary-bright">
                01 / Platform
              </span>
              <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
                Everything your church
                <br className="hidden sm:block" />
                runs on. <span className="text-ink-muted">Connected.</span>
              </h2>
            </div>
            <p className="hidden max-w-xs text-sm leading-relaxed text-ink-muted lg:block">
              Stop juggling spreadsheets, WhatsApp groups and notebooks.
              One calm headquarters for your entire ministry.
            </p>
          </div>
        </Reveal>

        {/* ── Bento-style grid — varied card sizes ── */}
        <StaggerGroup className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" stagger={0.06}>
          {featureCards.map((f, i) => {
            // First and last cards span wider for visual interest
            const isWide = i === 0 || i === 5;
            return (
              <StaggerItem key={f.title} className={cn(isWide && "sm:col-span-2 lg:col-span-1")}>
                <motion.article
                  whileHover={{ y: -4, transition: { duration: 0.25 } }}
                  className={cn(
                    "group relative h-full overflow-hidden rounded-2xl border border-line bg-surface p-6 transition-colors duration-300 hover:border-primary/25",
                    i === 0 && "lg:row-span-1",
                  )}
                >
                  {/* Hover glow */}
                  <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/5 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />

                  <div className="relative">
                    <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 text-primary-bright ring-1 ring-primary/10">
                      <f.icon className="size-[1.125rem]" />
                    </div>
                    <h3 className="font-display text-base font-semibold tracking-tight">{f.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.blurb}</p>
                  </div>

                  {/* Bottom accent line on hover */}
                  <div className="absolute bottom-0 left-6 right-6 h-px scale-x-0 bg-gradient-to-r from-transparent via-primary/30 to-transparent transition-transform duration-500 group-hover:scale-x-100" />
                </motion.article>
              </StaggerItem>
            );
          })}
        </StaggerGroup>
      </div>
    </section>
  );
}
