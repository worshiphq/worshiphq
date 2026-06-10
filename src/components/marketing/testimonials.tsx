"use client";

import { motion } from "motion/react";
import { Reveal } from "@/components/ui/reveal";
import { Avatar } from "@/components/ui/avatar";
import { testimonials } from "@/config/marketing";

export function Testimonials() {
  return (
    <section className="relative py-28">
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

        <div className="mt-14 columns-1 gap-4 md:columns-2 lg:columns-3 [&>*]:mb-4">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={(i % 3) * 0.08}>
              <motion.figure
                whileHover={{ y: -3 }}
                transition={{ duration: 0.25 }}
                className="group break-inside-avoid rounded-2xl border border-line bg-surface p-6 transition-colors duration-300 hover:border-primary/20"
              >
                {/* Quote mark — large, decorative */}
                <span className="block font-display text-4xl leading-none text-primary/15 select-none">&ldquo;</span>

                <blockquote className="mt-1 text-sm leading-relaxed text-ink">
                  {t.quote}
                </blockquote>

                <figcaption className="mt-5 flex items-center gap-3 border-t border-line-soft pt-4">
                  <Avatar name={t.name} size="sm" />
                  <div>
                    <div className="text-sm font-semibold text-ink">{t.name}</div>
                    <div className="text-xs text-ink-faint">
                      {t.role} &middot; {t.church}
                    </div>
                  </div>
                </figcaption>
              </motion.figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
