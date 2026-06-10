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
    <section className="relative py-28">
      {/* Divider with diamond */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-center">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-line" />
        <div className="mx-3 size-1.5 rotate-45 border border-line bg-surface" />
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-line" />
      </div>

      <div className="mx-auto max-w-3xl px-5">
        <Reveal>
          <div className="max-w-xl">
            <span className="mb-3 inline-block font-mono text-xs font-medium uppercase tracking-[0.2em] text-gold">
              08 / FAQ
            </span>
            <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Common questions,
              <br />
              <span className="text-ink-muted">honest answers.</span>
            </h2>
          </div>
        </Reveal>

        <div className="mt-14 space-y-3">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={f.q} delay={i * 0.06}>
                <div className={cn(
                  "rounded-2xl border border-line bg-surface transition-colors duration-300",
                  isOpen && "border-primary/20 bg-primary/[0.02]",
                )}>
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  >
                    <span className="flex items-baseline gap-3">
                      <span className="font-mono text-xs text-ink-faint">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-medium text-ink">{f.q}</span>
                    </span>
                    <Plus
                      className={cn(
                        "size-4 shrink-0 text-ink-muted transition-transform duration-300",
                        isOpen && "rotate-45 text-primary-bright",
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
                        <p className="px-6 pb-6 pl-[3.25rem] text-sm leading-relaxed text-ink-muted">
                          {f.a}
                        </p>
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
