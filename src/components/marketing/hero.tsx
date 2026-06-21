"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { ArrowRight, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LaptopFrame } from "./laptop-frame";
import { DashboardMockup } from "./dashboard-mockup";
import { AnimatedNumber } from "@/components/ui/animated-number";

const ease = [0.22, 1, 0.36, 1] as const;

const DEFAULT_SUBHEAD =
  "Members, giving, attendance, events, messaging — one calm headquarters for everything your church runs.";

export function Hero({ subhead = DEFAULT_SUBHEAD }: { subhead?: string }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const productY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const productScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);
  const bgY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const imgScale = useTransform(scrollYProgress, [0, 1], [1.05, 1.15]);

  return (
    <section ref={ref} className="relative overflow-hidden pb-10 pt-28 sm:pt-36 md:pb-20">
      {/* ── Background image with parallax ── */}
      <motion.div className="pointer-events-none absolute inset-0 -z-10" style={{ y: bgY }} aria-hidden>
        <motion.div className="absolute inset-0" style={{ scale: imgScale }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=1920&q=80&auto=format"
            alt=""
            className="size-full object-cover"
          />
        </motion.div>
        {/* Gradient overlay — warm, sanctuary feel */}
        <div className="absolute inset-0 bg-gradient-to-b from-base/95 via-base/85 to-base" />
        {/* Subtle warm tint */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-gold/5" />
      </motion.div>

      {/* ── Geometric accent lines ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-[12%] top-32 h-px w-32 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        <div className="absolute right-[15%] top-48 h-24 w-px bg-gradient-to-b from-transparent via-gold/15 to-transparent" />
        <div className="absolute left-[8%] top-[60%] size-2 rotate-45 border border-primary/10" />
        <div className="absolute right-[10%] top-[40%] size-1.5 rounded-full bg-gold/20" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-3xl text-center">
          {/* ── Headline ── */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease }}
            className="font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl"
          >
            Your ministry,{" "}
            <span className="relative inline-block">
              <span className="text-gradient">beautifully</span>
              <motion.svg
                className="absolute -bottom-2 left-0 h-3 w-full"
                viewBox="0 0 200 12"
                fill="none"
                preserveAspectRatio="none"
              >
                <motion.path
                  d="M2 8 C40 2, 80 12, 120 6 C160 0, 190 10, 198 4"
                  stroke="url(#hero-line)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.2, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
                />
                <defs>
                  <linearGradient id="hero-line" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#0d9488" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#b07d20" stopOpacity="0.4" />
                  </linearGradient>
                </defs>
              </motion.svg>
            </span>
            <br />
            organized.
          </motion.h1>

          {/* ── Subhead ── */}
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease }}
            className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg"
          >
            {subhead}
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
          <div className="absolute inset-x-8 -bottom-10 top-8 -z-10 rounded-[2rem] bg-primary/10 blur-[60px]" />

          <FloatingChip className="-left-3 top-8 sm:-left-12" delay={0.9} label="Active members" value={3085} color="primary" />
          <FloatingChip className="-right-3 top-20 sm:-right-14" delay={1.1} label="Monthly giving" value={58400} prefix="₵" color="gold" />
          <FloatingChip className="-left-3 bottom-12 sm:-left-10" delay={1.3} label="Departments" value={8} color="success" />

          <LaptopFrame>
            <DashboardMockup />
          </LaptopFrame>
        </motion.div>
      </div>
    </section>
  );
}

function FloatingChip({
  className, label, value, prefix = "", delay, color = "primary",
}: {
  className?: string; label: string; value: number; prefix?: string; delay: number; color?: "primary" | "gold" | "success";
}) {
  const dotColor = { primary: "bg-primary-bright", gold: "bg-gold", success: "bg-success" }[color];
  return (
    <motion.div
      initial={{ opacity: 0, x: color === "gold" ? 20 : -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`absolute z-20 hidden rounded-2xl border border-line bg-surface/90 px-4 py-3 shadow-lg backdrop-blur-md sm:block ${className}`}
    >
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <span className={`size-1.5 rounded-full ${dotColor}`} />
        {label}
      </div>
      <div className="mt-0.5 font-display text-lg font-bold tracking-tight">
        {prefix}<AnimatedNumber value={value} />
      </div>
    </motion.div>
  );
}
