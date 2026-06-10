"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { Reveal } from "@/components/ui/reveal";
import { Avatar } from "@/components/ui/avatar";
import { testimonials } from "@/config/marketing";

export function Testimonials() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: scrollRef,
    offset: ["start end", "end start"],
  });
  const row1X = useTransform(scrollYProgress, [0, 1], [0, -200]);
  const row2X = useTransform(scrollYProgress, [0, 1], [-100, 100]);

  return (
    <section ref={scrollRef} className="relative py-28 overflow-hidden">
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

      {/* ── Scrolling testimonial rows ── */}
      <div className="relative mt-14">
        {/* Row 1 */}
        <motion.div style={{ x: row1X }} className="flex gap-4 px-5">
          {[...testimonials, ...testimonials].map((t, i) => (
            <TestimonialCard key={`a-${i}`} t={t} />
          ))}
        </motion.div>

        {/* Row 2 — opposite direction */}
        <motion.div style={{ x: row2X }} className="mt-4 flex gap-4 px-5">
          {[...testimonials.slice(3), ...testimonials.slice(0, 3), ...testimonials].map((t, i) => (
            <TestimonialCard key={`b-${i}`} t={t} />
          ))}
        </motion.div>

        {/* Fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-base to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-base to-transparent" />
      </div>
    </section>
  );
}

function TestimonialCard({ t }: { t: (typeof testimonials)[number] }) {
  return (
    <motion.figure
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25 }}
      className="w-[380px] shrink-0 rounded-2xl border border-line bg-surface p-6 transition-colors duration-300 hover:border-primary/20"
    >
      <span className="block font-display text-4xl leading-none text-primary/15 select-none">&ldquo;</span>
      <blockquote className="mt-1 text-sm leading-relaxed text-ink">{t.quote}</blockquote>
      <figcaption className="mt-5 flex items-center gap-3 border-t border-line-soft pt-4">
        <Avatar name={t.name} size="sm" />
        <div>
          <div className="text-sm font-semibold text-ink">{t.name}</div>
          <div className="text-xs text-ink-faint">{t.role} &middot; {t.church}</div>
        </div>
      </figcaption>
    </motion.figure>
  );
}
