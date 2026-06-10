"use client";

import { motion } from "motion/react";
import { Check, ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { spotlights } from "@/config/marketing";
import { cn } from "@/lib/utils";

const sectionNumbers = ["02", "03", "04", "05"];

export function Spotlights() {
  return (
    <section className="relative overflow-hidden py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-32 px-5 py-12">
        {spotlights.map((s, i) => {
          const flipped = i % 2 === 1;
          return (
            <div key={s.title} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <Reveal className={cn(flipped && "lg:order-2")}>
                {/* Section number */}
                <span className="mb-3 inline-block font-mono text-xs font-medium uppercase tracking-[0.2em] text-primary-bright">
                  {sectionNumbers[i]} / {s.eyebrow}
                </span>

                <h3 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  {s.title}
                </h3>
                <p className="mt-4 text-base leading-relaxed text-ink-muted">{s.body}</p>

                <ul className="mt-6 space-y-3">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-sm text-ink">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary-bright">
                        <Check className="size-3" strokeWidth={2.5} />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal delay={0.12} className={cn(flipped && "lg:order-1")}>
                <motion.figure
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.3 }}
                  className="group relative overflow-hidden rounded-2xl border border-line bg-surface shadow-lg"
                >
                  {/* Gradient overlay — warm, not generic */}
                  <div className="absolute inset-0 z-10 bg-gradient-to-t from-ink/30 via-transparent to-transparent" />

                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.image}
                    alt={s.title}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                  />

                  {/* Floating label */}
                  <figcaption className="absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-xl bg-surface/90 px-3 py-2 text-xs font-medium text-ink backdrop-blur-sm">
                    <ArrowUpRight className="size-3 text-primary-bright" />
                    {s.eyebrow}
                  </figcaption>

                  {/* Corner accent */}
                  <div className="absolute right-4 top-4 z-20 size-8 rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm" />
                </motion.figure>
              </Reveal>
            </div>
          );
        })}
      </div>
    </section>
  );
}
