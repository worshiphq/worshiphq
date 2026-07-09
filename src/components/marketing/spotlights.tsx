"use client";

import { motion } from "motion/react";
import { Reveal } from "@/components/ui/reveal";
import { spotlights } from "@/config/marketing";
import { cn } from "@/lib/utils";

const NUMERALS = ["II", "III", "IV", "V"];

export function Spotlights() {
  return (
    <section className="relative overflow-hidden py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-28 px-5 py-10 sm:gap-36">
        {spotlights.map((s, i) => {
          const flipped = i % 2 === 1;
          return (
            <div key={s.title} className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
              {/* ── Text column ── */}
              <Reveal className={cn(flipped && "lg:order-2")}>
                <div className="flex items-baseline gap-4">
                  <span className="font-serif text-sm italic text-brass">{NUMERALS[i]?.toLowerCase()}.</span>
                  <p className="rubric">{s.eyebrow}</p>
                </div>

                <h3 className="press-display mt-5 text-3xl sm:text-[2.6rem] sm:leading-[1.05]">
                  {s.title}
                </h3>
                <p className="mt-5 max-w-md text-[15px] leading-[1.85] text-ink-muted">{s.body}</p>

                {/* Points as a small liturgical list */}
                <ul className="mt-8 max-w-md divide-y divide-ink/8 border-y border-ink/10">
                  {s.points.map((p, j) => (
                    <li key={p} className="flex items-baseline gap-3.5 py-3 text-sm text-ink">
                      <span className="font-serif text-xs italic text-brass">{String.fromCharCode(97 + j)}.</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </Reveal>

              {/* ── Plate column ── */}
              <Reveal delay={0.12} className={cn(flipped && "lg:order-1")}>
                <motion.figure
                  whileHover={{ y: -5 }}
                  transition={{ duration: 0.35 }}
                  className="group relative"
                >
                  {/* Offset engraved frame behind the image */}
                  <div
                    className={cn(
                      "absolute -z-10 border border-brass/40",
                      flipped ? "-left-4 -top-4 right-4 bottom-4" : "-right-4 -top-4 left-4 bottom-4",
                    )}
                    aria-hidden
                  />
                  <div className="relative overflow-hidden border border-ink/15 bg-surface shadow-[0_24px_50px_-30px_rgba(28,26,22,0.45)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.image}
                      alt={s.title}
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    />
                    {/* Warm duotone wash */}
                    <div className="pointer-events-none absolute inset-0 bg-evergreen/12 mix-blend-multiply" />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-evergreen-deep/35 via-transparent to-transparent" />
                  </div>
                  <figcaption className="mt-4 flex items-baseline justify-between font-serif text-xs italic text-ink-faint">
                    <span>Plate {NUMERALS[i]} — {s.eyebrow}</span>
                    <span className="text-brass">✦</span>
                  </figcaption>
                </motion.figure>
              </Reveal>
            </div>
          );
        })}
      </div>
    </section>
  );
}
