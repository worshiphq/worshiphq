"use client";

import { motion } from "motion/react";
import { Reveal } from "@/components/ui/reveal";
import { Avatar } from "@/components/ui/avatar";
import { testimonials as defaultTestimonials, type Testimonial } from "@/config/marketing";

export function Testimonials({ items }: { items?: Testimonial[] }) {
  const list = items && items.length ? items : defaultTestimonials;
  // Two rows that scroll automatically and continuously in opposite directions.
  const rowA = [...list, ...list];
  const rowBBase = [...list.slice(3), ...list.slice(0, 3)];
  const rowB = [...rowBBase, ...rowBBase];

  return (
    <section className="relative py-28 overflow-hidden">
      {/* Divider with diamond */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-center">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-line" />
        <div className="mx-3 size-1.5 rotate-45 border border-line bg-surface" />
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-line" />
      </div>

      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <div className="max-w-xl">
            <span className="mb-3 inline-block font-mono text-xs font-medium uppercase tracking-[0.2em] text-gold">
              07 / Testimonials
            </span>
            <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Loved by pastors
              <br />
              <span className="text-ink-muted">and their teams.</span>
            </h2>
            <p className="mt-3 text-xs text-ink-faint">Names and churches are illustrative placeholders.</p>
          </div>
        </Reveal>
      </div>

      {/* ── Auto-scrolling testimonial rows ── */}
      <div className="relative mt-14 flex flex-col gap-4">
        <Marquee items={rowA} direction="left" duration={45} />
        <Marquee items={rowB} direction="right" duration={55} />

        {/* Fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-base to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-base to-transparent" />
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
        className="flex shrink-0 gap-4 pr-4"
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
    <figure className="w-[380px] shrink-0 rounded-2xl border border-line bg-surface p-6 transition-colors duration-300 hover:border-primary/20">
      <span className="block font-display text-4xl leading-none text-primary/15 select-none">&ldquo;</span>
      <blockquote className="mt-1 text-sm leading-relaxed text-ink">{t.quote}</blockquote>
      <figcaption className="mt-5 flex items-center gap-3 border-t border-line-soft pt-4">
        <Avatar name={t.name} size="sm" />
        <div>
          <div className="text-sm font-semibold text-ink">{t.name}</div>
          <div className="text-xs text-ink-faint">{t.role} &middot; {t.church}</div>
        </div>
      </figcaption>
    </figure>
  );
}
