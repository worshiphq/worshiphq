"use client";

import { motion } from "motion/react";
import { Reveal } from "@/components/ui/reveal";
import { testimonials as defaultTestimonials, type Testimonial } from "@/config/marketing";

export function Testimonials({ items }: { items?: Testimonial[] }) {
  const list = items && items.length ? items : defaultTestimonials;
  // Two rows that scroll automatically and continuously in opposite directions.
  const rowA = [...list, ...list];
  const rowBBase = [...list.slice(3), ...list.slice(0, 3)];
  const rowB = [...rowBBase, ...rowBBase];

  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <p className="rubric mb-4">Testimonials</p>
          <div className="flex flex-wrap items-end justify-between gap-6 border-t-2 border-evergreen pt-8">
            <h2 className="press-display text-4xl sm:text-5xl">
              In their own
              <span className="text-primary"> words.</span>
            </h2>
            <p className="max-w-[16rem] text-xs leading-relaxed text-ink-faint">
              Names and churches are illustrative placeholders.
            </p>
          </div>
        </Reveal>
      </div>

      {/* ── Auto-scrolling letter rows ── */}
      <div className="relative mt-14 flex flex-col gap-5">
        <Marquee items={rowA} direction="left" duration={48} />
        <Marquee items={rowB} direction="right" duration={58} />

        {/* Fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-base to-transparent sm:w-28" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-base to-transparent sm:w-28" />
      </div>
    </section>
  );
}

function Marquee({
  items,
  direction,
  duration,
}: {
  items: Testimonial[];
  direction: "left" | "right";
  duration: number;
}) {
  // The list is doubled, so animating across exactly half its width loops seamlessly.
  const from = direction === "left" ? "0%" : "-50%";
  const to = direction === "left" ? "-50%" : "0%";

  return (
    <div className="flex overflow-hidden">
      <motion.div
        className="flex shrink-0 gap-5 pr-5"
        initial={{ x: from }}
        animate={{ x: to }}
        transition={{ duration, ease: "linear", repeat: Infinity }}
      >
        {items.map((t, i) => (
          <TestimonialCard key={`${direction}-${i}`} t={t} />
        ))}
      </motion.div>
    </div>
  );
}

function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <figure className="relative w-[400px] shrink-0 border border-ink/12 bg-surface p-7 transition-colors duration-300 hover:border-brass/40">
      {/* Gilt top edge */}
      <span className="absolute inset-x-7 top-0 h-0.5 bg-gradient-to-r from-transparent via-brass/50 to-transparent" aria-hidden />
      <span className="block font-display text-5xl font-bold leading-none text-brass/30 select-none" aria-hidden>
        &ldquo;
      </span>
      <blockquote className="mt-1 text-[15px] leading-[1.75] text-ink">
        {t.quote}
      </blockquote>
      <figcaption className="mt-6 flex items-baseline justify-between gap-3 border-t border-ink/8 pt-4">
        <div>
          <div className="font-display text-sm font-bold tracking-tight text-evergreen-deep">{t.name}</div>
          <div className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-ink-faint">
            {t.role}
          </div>
        </div>
        <div className="text-right text-[11px] text-ink-faint">{t.church}</div>
      </figcaption>
    </figure>
  );
}
