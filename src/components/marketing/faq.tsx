"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { faqs } from "@/config/marketing";
import { cn } from "@/lib/utils";

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-5">
        <Reveal>
          <div className="mb-4 flex items-baseline gap-4">
            <span className="font-serif text-sm italic text-brass">ix.</span>
            <p className="rubric">The Catechism</p>
          </div>
          <div className="border-t-2 border-evergreen pt-8">
            <h2 className="press-display text-4xl sm:text-5xl">
              Asked, and
              <em className="font-light italic text-primary"> answered.</em>
            </h2>
          </div>
        </Reveal>

        <div className="mt-12 divide-y divide-ink/10 border-y border-ink/10">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={f.q} delay={i * 0.05}>
                <div>
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="group flex w-full items-baseline justify-between gap-6 py-6 text-left"
                  >
                    <span className="flex items-baseline gap-4">
                      <span className="font-serif text-sm italic text-brass">
                        Q{i + 1}.
                      </span>
                      <span
                        className={cn(
                          "font-serif text-lg transition-colors sm:text-xl",
                          isOpen ? "font-semibold text-evergreen-deep" : "text-ink group-hover:text-evergreen",
                        )}
                      >
                        {f.q}
                      </span>
                    </span>
                    <Plus
                      className={cn(
                        "size-4 shrink-0 self-center text-ink-faint transition-transform duration-300",
                        isOpen && "rotate-45 text-brass",
                      )}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="flex gap-4 pb-7 pl-0 sm:pl-1">
                          <span className="font-serif text-sm italic text-evergreen shrink-0">A.</span>
                          <p className="max-w-xl text-[15px] leading-[1.85] text-ink-muted">{f.a}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
