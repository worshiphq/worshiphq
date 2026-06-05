"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, PlayCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Aurora, GridBackdrop } from "./aurora";
import { LaptopFrame } from "./laptop-frame";
import { DashboardMockup } from "./dashboard-mockup";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { brand } from "@/config/brand";

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40">
      <Aurora />
      <GridBackdrop />

      <div className="relative mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
            className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-3.5 py-1.5 text-xs text-ink-muted backdrop-blur"
          >
            <Sparkles className="size-3.5 text-gold" />
            Built for churches in {brand.region.country} {brand.region.flag}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05, ease }}
            className="font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl md:text-7xl"
          >
            Your church&rsquo;s
            <br />
            <span className="text-gradient">command center.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease }}
            className="mx-auto mt-6 max-w-xl text-lg text-ink-muted"
          >
            Everything your church needs to manage, connect, and grow — in one beautiful place.
            Built for churches in Ghana and across Africa.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25, ease }}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link href="/sign-in">
              <Button size="lg" className="group">
                Start free
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" variant="glass">
                <PlayCircle />
                Request demo
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-6 text-xs text-ink-faint"
          >
            No credit card needed · Free forever for up to 50 members
          </motion.div>
        </div>

        {/* Product visual */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.35, ease }}
          className="relative mx-auto mt-16 max-w-4xl"
        >
          {/* floating stat chips */}
          <FloatingChip className="-left-2 top-10 sm:-left-10" delay={0.8} label="Active members" value={3085} />
          <FloatingChip
            className="-right-2 top-24 sm:-right-12"
            delay={1.0}
            label="Monthly giving"
            value={58400}
            prefix="₵"
          />
          <FloatingChip className="-left-2 bottom-8 sm:-left-14" delay={1.2} label="Branches" value={4} />

          <div className="relative">
            <div className="absolute inset-0 -z-10 mx-auto h-full w-3/4 rounded-full bg-primary/20 blur-[100px]" />
            <LaptopFrame>
              <DashboardMockup />
            </LaptopFrame>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function FloatingChip({
  className,
  label,
  value,
  prefix = "",
  delay,
}: {
  className?: string;
  label: string;
  value: number;
  prefix?: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease }}
      className={`absolute z-20 hidden rounded-xl border border-line bg-surface/90 px-3.5 py-2.5 shadow-xl backdrop-blur sm:block ${className}`}
    >
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="font-display text-lg font-bold text-ink">
        <AnimatedNumber value={value} prefix={prefix} />
      </div>
    </motion.div>
  );
}
