"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Reveal } from "@/components/ui/reveal";
import { featureCards } from "@/config/marketing";
import { cn } from "@/lib/utils";

export function FeatureGrid() {
  const [active, setActive] = useState(0);
  const feature = featureCards[active];

  return (
    <section id="features" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5">
        {/* ── Section heading ── */}
        <Reveal>
          <div className="mb-4 flex items-baseline gap-4">
            <span className="font-serif text-sm italic text-brass">i.</span>
            <p className="rubric">The Index</p>
          </div>
          <div className="grid gap-8 border-t-2 border-evergreen pt-8 lg:grid-cols-[1.2fr_1fr]">
            <h2 className="press-display text-4xl sm:text-5xl">
              Every ministry,
              <br />
              <em className="font-light italic text-primary">one register.</em>
            </h2>
            <p className="dropcap max-w-md self-end text-[15px] leading-[1.8] text-ink-muted">
              Stop juggling spreadsheets, WhatsApp groups and paper notebooks.
              WorshipHQ gathers the whole life of your church — the people, the
              giving, the services, the messages — into one calm, well-kept book.
            </p>
          </div>
        </Reveal>

        {/* ── Hymnal index + reading pane ── */}
        <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          {/* Index list with dotted leaders */}
          <Reveal>
            <ol className="divide-y divide-ink/8">
              {featureCards.map((f, i) => {
                const isActive = i === active;
                return (
                  <li key={f.title}>
                    <button
                      onClick={() => setActive(i)}
                      onMouseEnter={() => setActive(i)}
                      className={cn(
                        "leaders group w-full py-3.5 text-left transition-colors",
                        isActive ? "text-evergreen-deep" : "text-ink-muted hover:text-ink",
                      )}
                    >
                      <span
                        className={cn(
                          "text-[15px] transition-all",
                          isActive ? "font-serif text-lg font-semibold italic" : "font-medium",
                        )}
                      >
                        {f.title}
                      </span>
                      <span
                        className={cn(
                          "font-serif text-sm tabular-nums",
                          isActive ? "text-brass" : "text-ink-faint",
                        )}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </Reveal>

          {/* Reading pane — the selected entry, set like a hymn page */}
          <Reveal delay={0.12}>
            <div className="paper-panel sticky top-24 overflow-hidden border border-ink/12 p-8 shadow-[0_18px_44px_-30px_rgba(28,26,22,0.4)] sm:p-10">
              {/* corner ticks */}
              <span className="absolute left-3 top-3 size-3 border-l border-t border-brass/50" aria-hidden />
              <span className="absolute right-3 top-3 size-3 border-r border-t border-brass/50" aria-hidden />
              <span className="absolute bottom-3 left-3 size-3 border-b border-l border-brass/50" aria-hidden />
              <span className="absolute bottom-3 right-3 size-3 border-b border-r border-brass/50" aria-hidden />

              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="relative"
                >
                  <div className="mb-6 flex items-center justify-between">
                    <span className="font-serif text-5xl font-light italic text-brass/50">
                      {String(active + 1).padStart(2, "0")}
                    </span>
                    <div className="grid size-12 place-items-center border border-evergreen/20 bg-evergreen/5 text-evergreen">
                      <feature.icon className="size-5" strokeWidth={1.75} />
                    </div>
                  </div>

                  <h3 className="font-serif text-2xl font-semibold text-evergreen-deep sm:text-3xl">
                    {feature.title}
                  </h3>
                  <div className="ornament-divider my-5 text-[10px]">✦</div>
                  <p className="text-[15px] leading-[1.85] text-ink-muted">{feature.blurb}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
