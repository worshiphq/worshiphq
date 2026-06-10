"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { brand } from "@/config/brand";

export function FinalCTA() {
  return (
    <section className="relative px-5 py-24">
      <Reveal>
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-surface via-primary-soft/30 to-surface">
          {/* Decorative elements */}
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {/* Large radial glow */}
            <div className="absolute -right-20 -top-20 size-80 rounded-full bg-primary/8 blur-[80px]" />
            <div className="absolute -bottom-10 -left-10 size-60 rounded-full bg-gold/6 blur-[60px]" />
            {/* Grid dots */}
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
                backgroundSize: "24px 24px",
              }}
            />
            {/* Corner accents */}
            <div className="absolute left-8 top-8 size-12 rounded-xl border border-primary/10" />
            <div className="absolute bottom-8 right-8 size-8 rotate-45 border border-gold/10" />
          </div>

          <div className="relative px-6 py-16 text-center sm:px-12 sm:py-24">
            <motion.div
              initial={{ scale: 0.95 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="mb-4 inline-block font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-primary-bright">
                Get started today
              </span>

              <h2 className="mx-auto max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl">
                Give your ministry the
                <br />
                headquarters it deserves.
              </h2>

              <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-ink-muted">
                Join churches across {brand.region.country} running everything in one beautiful place.
                Free forever for up to 50 members.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/sign-up">
                  <Button size="lg" className="group">
                    Get started free
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <Link href="/sign-in">
                  <Button size="lg" variant="glass">
                    View live demo
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
