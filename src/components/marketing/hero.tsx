"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { ArrowRight, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LaptopFrame } from "./laptop-frame";
import { DashboardMockup } from "./dashboard-mockup";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { brand } from "@/config/brand";

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const productY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const productScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);
  const bgY = useTransform(scrollYProgress, [0, 1], [0, 120]);

  return (
    <section ref={ref} className="relative overflow-hidden pb-10 pt-28 sm:pt-36 md:pb-20">
      {/* ── Organic background shapes (not generic aurora blobs) ── */}
      <motion.div className="pointer-events-none absolute inset-0" style={{ y: bgY }} aria-hidden>
        {/* Large warm radial — off-center for asymmetry */}
        <div
          className="absolute -right-20 -top-32 size-[50rem] rounded-full opacity-[0.12] blur-[120px]"
          style={{ background: "conic-gradient(from 180deg at 60% 40%, #5b43db, #b07d20 40%, #5b43db 80%)" }}
        />
        {/* Subtle gold accent — bottom left */}
        <div
          className="absolute -bottom-20 -left-20 size-[30rem] rounded-full opacity-[0.08] blur-[100px]"
          style={{ background: "radial-gradient(circle, #b07d20 0%, transparent 70%)" }}
        />
        {/* Noise grain */}
        <div className="grain absolute inset-0" />
      </motion.div>

      {/* ── Geometric accent lines ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-[12%] top-32 h-px w-32 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        <div className="absolute right-[15%] top-48 h-24 w-px bg-gradient-to-b from-transparent via-gold/15 to-transparent" />
        <div className="absolute left-[8%] top-[60%] size-2 rotate-45 border border-primary/10" />
        <div className="absolute right-[10%] top-[40%] size-1.5 rounded-full bg-gold/20" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5">
        {/* ── Eyebrow — asymmetric, left-aligned on desktop ── */}
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease }}
            className="mb-5 inline-flex items-center gap-2.5 rounded-full border border-gold/25 bg-gold/5 px-4 py-2 text-xs font-medium tracking-wide text-gold"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-gold opacity-50" />
              <span className="relative inline-flex size-2 rounded-full bg-gold" />
            </span>
            Built for churches in {brand.region.country}
          </motion.div>

          {/* ── Headline — editorial split with weight contrast ── */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.08, ease }}
            className="font-display text-[2.75rem] font-bold leading-[1.05] tracking-tight sm:text-6xl md:text-[4.5rem] md:leading-[1.02]"
          >
            <span className="text-ink">Manage your church.</span>
            <br />
            <span className="relative inline-block">
              <span className="relative z-10 bg-gradient-to-r from-primary via-primary-bright to-gold bg-clip-text text-transparent">
                Beautifully.
              </span>
              {/* Decorative underline stroke */}
              <motion.svg
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
                viewBox="0 0 286 12"
                className="absolute -bottom-1 left-0 w-full"
                fill="none"
                preserveAspectRatio="none"
              >
                <motion.path
                  d="M2 8.5c47-6 96-8 143-7 47 1 93 5 139 3"
                  stroke="url(#hero-line)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.2, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
                />
                <defs>
                  <linearGradient id="hero-line" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#5b43db" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#b07d20" stopOpacity="0.4" />
                  </linearGradient>
                </defs>
              </motion.svg>
            </span>
          </motion.h1>

          {/* ── Subhead ── */}
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease }}
            className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-ink-muted sm:text-lg"
          >
            People, giving, events, communications and more — all in one
            place. Built for the way churches in {brand.region.country} actually work.
          </motion.p>

          {/* ── CTA row ── */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease }}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link href="/sign-up">
              <Button size="lg" className="group relative overflow-hidden">
                <span className="relative z-10 flex items-center gap-2">
                  Get started free
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button size="lg" variant="glass" className="group">
                <PlayCircle className="size-4 transition-transform group-hover:scale-110" />
                View live demo
              </Button>
            </Link>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-5 text-xs text-ink-faint"
          >
            Free forever for up to 50 members &middot; No credit card
          </motion.p>
        </div>

        {/* ── Product shot with parallax + floating metrics ── */}
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.4, ease }}
          style={{ y: productY, scale: productScale }}
          className="relative mx-auto mt-14 max-w-4xl sm:mt-20"
        >
          {/* Ambient glow behind the laptop */}
          <div className="absolute inset-x-8 -bottom-10 top-8 -z-10 rounded-[2rem] bg-primary/10 blur-[60px]" />

          {/* Floating stat chips — staggered, organic placement */}
          <FloatingChip
            className="-left-3 top-8 sm:-left-12"
            delay={0.9}
            label="Active members"
            value={3085}
            color="primary"
          />
          <FloatingChip
            className="-right-3 top-20 sm:-right-14"
            delay={1.1}
            label="Monthly giving"
            value={58400}
            prefix="₵"
            color="gold"
          />
          <FloatingChip
            className="-left-3 bottom-12 sm:-left-10"
            delay={1.3}
            label="Branches"
            value={4}
            color="success"
          />

          <LaptopFrame>
            <DashboardMockup />
          </LaptopFrame>
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
  color = "primary",
}: {
  className?: string;
  label: string;
  value: number;
  prefix?: string;
  delay: number;
  color?: "primary" | "gold" | "success";
}) {
  const borderColor = {
    primary: "border-primary/20",
    gold: "border-gold/20",
    success: "border-success/20",
  }[color];
  const dotColor = {
    primary: "bg-primary",
    gold: "bg-gold",
    success: "bg-success",
  }[color];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease }}
      className={`absolute z-20 hidden rounded-2xl border ${borderColor} bg-surface/95 px-4 py-3 shadow-lg backdrop-blur-sm sm:block ${className}`}
    >
      <div className="flex items-center gap-2">
        <div className={`size-1.5 rounded-full ${dotColor}`} />
        <span className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">{label}</span>
      </div>
      <div className="mt-1 font-display text-xl font-bold text-ink">
        <AnimatedNumber value={value} prefix={prefix} />
      </div>
    </motion.div>
  );
}
