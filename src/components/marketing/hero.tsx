"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { LaptopFrame } from "./laptop-frame";
import { DashboardMockup } from "./dashboard-mockup";
import { AnimatedNumber } from "@/components/ui/animated-number";

const ease = [0.22, 1, 0.36, 1] as const;

const DEFAULT_SUBHEAD =
  "Members, giving, attendance, events, messaging — one calm headquarters for everything your church runs.";

/* Order-of-service style index shown beside the headline */
const ORDER_OF_SERVICE = [
  { label: "People & membership", n: "№ 01" },
  { label: "Giving & Mobile Money", n: "№ 02" },
  { label: "Attendance & QR check-in", n: "№ 03" },
  { label: "SMS to the whole church", n: "№ 04" },
];

export function Hero({ subhead = DEFAULT_SUBHEAD }: { subhead?: string }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const plateY = useTransform(scrollYProgress, [0, 1], [0, -50]);

  return (
    <section ref={ref} className="paper-panel relative overflow-hidden pb-8 pt-28 sm:pt-32 md:pb-16">
      {/* ── Engraved margin rules, like a typeset page ── */}
      <div className="pointer-events-none absolute inset-y-0 left-4 hidden w-px bg-ink/8 lg:block xl:left-10" aria-hidden />
      <div className="pointer-events-none absolute inset-y-0 right-4 hidden w-px bg-ink/8 lg:block xl:right-10" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-5">
        {/* ── Masthead line ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease }}
          className="flex items-center justify-between border-b border-ink/15 pb-3 text-[10px] uppercase tracking-[0.25em] text-ink-faint"
        >
          <span className="whitespace-nowrap">Est. for the local church</span>
          <span className="hidden items-center gap-2 md:flex">
            <span className="text-brass">✦</span> Accra · Lagos · Nairobi · everywhere
          </span>
          <span className="whitespace-nowrap">Free for 50 members</span>
        </motion.div>

        <div className="grid gap-12 pt-12 lg:grid-cols-[1.6fr_1fr] lg:gap-8 lg:pt-16">
          {/* ── Headline column ── */}
          <div>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease }}
              className="rubric mb-6"
            >
              The Church Management System
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.08, ease }}
              className="press-display text-[2.9rem] sm:text-6xl md:text-7xl"
            >
              Order in the house
              <br />
              of the{" "}
              <em className="relative font-serif font-light italic text-primary">
                Lord.
                <svg
                  className="absolute -bottom-2 left-0 h-2.5 w-full text-brass/70"
                  viewBox="0 0 120 10"
                  fill="none"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <motion.path
                    d="M2 7 C30 3, 60 9, 90 5 C105 3, 112 6, 118 4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.1, delay: 0.9, ease }}
                  />
                </svg>
              </em>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.22, ease }}
              className="mt-7 max-w-lg text-base leading-relaxed text-ink-muted sm:text-lg"
            >
              {subhead}
            </motion.p>

            {/* ── CTAs ── */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.32, ease }}
              className="mt-9 flex flex-wrap items-center gap-4"
            >
              <Link
                href="/sign-up"
                className="group inline-flex items-center gap-2.5 rounded-full bg-evergreen px-7 py-3.5 text-sm font-semibold text-parchment shadow-[0_14px_30px_-12px_rgba(11,43,38,0.5)] transition-all hover:bg-evergreen-deep hover:shadow-[0_18px_36px_-12px_rgba(11,43,38,0.6)]"
              >
                Begin your register
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/sign-in"
                className="group inline-flex items-center gap-2 border-b border-ink/25 pb-0.5 text-sm font-medium text-ink transition-colors hover:border-brass hover:text-evergreen"
              >
                View the live demo
                <span className="text-brass transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-5 text-xs italic text-ink-faint"
            >
              Free forever for up to 50 members — no credit card, no catch.
            </motion.p>
          </div>

          {/* ── Order of service index ── */}
          <motion.aside
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease }}
            className="hidden self-end lg:block"
            aria-label="What WorshipHQ covers"
          >
            <div className="border-t-2 border-evergreen pt-4">
              <p className="rubric mb-5 !text-[10px]">Order of Service</p>
              <ol className="space-y-3.5">
                {ORDER_OF_SERVICE.map((item, i) => (
                  <motion.li
                    key={item.n}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.55 + i * 0.1, ease }}
                    className="leaders text-sm text-ink"
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="font-serif text-xs italic text-brass">{item.n}</span>
                  </motion.li>
                ))}
              </ol>
              <p className="mt-6 border-t border-ink/10 pt-3 text-[11px] italic leading-relaxed text-ink-faint">
                &ldquo;Let all things be done decently and in order.&rdquo;
                <span className="not-italic"> — 1 Cor. 14:40</span>
              </p>
            </div>
          </motion.aside>
        </div>

        {/* ── Product plate — engraved figure ── */}
        <motion.figure
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5, ease }}
          style={{ y: plateY }}
          className="relative mx-auto mt-16 max-w-4xl sm:mt-20"
        >
          {/* Brass corner ticks */}
          <div className="pointer-events-none absolute -inset-3 z-10 hidden sm:block" aria-hidden>
            <span className="absolute left-0 top-0 size-4 border-l-2 border-t-2 border-brass/60" />
            <span className="absolute right-0 top-0 size-4 border-r-2 border-t-2 border-brass/60" />
            <span className="absolute bottom-0 left-0 size-4 border-b-2 border-l-2 border-brass/60" />
            <span className="absolute bottom-0 right-0 size-4 border-b-2 border-r-2 border-brass/60" />
          </div>

          <div className="absolute inset-x-10 -bottom-8 top-10 -z-10 rounded-[2rem] bg-evergreen/12 blur-[54px]" />

          <FloatingChip className="left-2 top-10 lg:-left-12" delay={1.0} label="Active members" value={3085} />
          <FloatingChip className="right-2 top-24 lg:-right-14" delay={1.2} label="Monthly giving" value={58400} prefix="₵" gold />
          <FloatingChip className="left-2 bottom-14 lg:-left-10" delay={1.4} label="Departments" value={8} />

          <LaptopFrame>
            <DashboardMockup />
          </LaptopFrame>

          <figcaption className="mt-5 text-center font-serif text-xs italic text-ink-faint">
            Fig. 1 — The Sunday-morning dashboard, as your team will see it.
          </figcaption>
        </motion.figure>
      </div>
    </section>
  );
}

function FloatingChip({
  className, label, value, prefix = "", delay, gold = false,
}: {
  className?: string; label: string; value: number; prefix?: string; delay: number; gold?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`absolute z-20 hidden border px-4 py-3 sm:block ${gold ? "border-brass/40" : "border-evergreen/25"} rounded-none bg-surface/95 shadow-[0_10px_28px_-14px_rgba(28,26,22,0.35)] backdrop-blur-sm ${className}`}
    >
      <div className="rubric !text-[9px] !tracking-[0.2em]">{label}</div>
      <div className="mt-1 font-serif text-xl font-semibold text-evergreen-deep">
        {prefix}<AnimatedNumber value={value} />
      </div>
    </motion.div>
  );
}
