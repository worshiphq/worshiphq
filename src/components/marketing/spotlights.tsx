"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/ui/reveal";
import { spotlights, type Spotlight } from "@/config/marketing";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/** One feature: words on one side, the real screen on the other. The screens drift at different speeds as you scroll. */
function SpotlightRow({ s, i }: { s: Spotlight; i: number }) {
  const flipped = i % 2 === 1;
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionSafe();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const shotY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [40, -40]);
  const phoneY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [90, -70]);
  const chipY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-30, 50]);

  return (
    <div ref={ref} className={cn("grid items-center gap-12 lg:gap-16", flipped ? "lg:grid-cols-[1.15fr_0.85fr]" : "lg:grid-cols-[0.85fr_1.15fr]")}>
      {/* ── Words ── */}
      <div className={cn(flipped && "lg:order-2")}>
        <Reveal>
          <div className="flex items-center gap-4">
            <span className="font-display text-5xl font-bold leading-none text-transparent [-webkit-text-stroke:1px_var(--color-brass)]">{String(i + 1).padStart(2, "0")}</span>
            <p className="rubric">{s.eyebrow}</p>
          </div>
          <h3 className="press-display mt-5 text-3xl sm:text-[2.6rem] sm:leading-[1.05]">{s.title}</h3>
          <p className="mt-5 max-w-md text-[15px] leading-[1.85] text-ink-muted">{s.body}</p>
        </Reveal>
        <StaggerGroup className="mt-8 max-w-md divide-y divide-ink/8 border-y border-ink/10" stagger={0.09}>
          {s.points.map((p) => (
            <StaggerItem key={p}>
              <div className="flex items-baseline gap-3 py-3 text-sm text-ink">
                <span className="text-brass">✦</span>
                {p}
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>

      {/* ── The real screens ── */}
      <div className={cn("relative isolate", flipped && "lg:order-1")}>
        {/* A soft plate behind the screens */}
        <div className={cn("absolute inset-y-6 -z-10 w-[86%] bg-evergreen-deep", flipped ? "left-0" : "right-0")} aria-hidden>
          <div className="absolute inset-0 opacity-60" style={{ background: "radial-gradient(80% 70% at 60% 30%, rgba(151,116,42,0.35) 0%, transparent 70%)" }} />
          <div className="absolute inset-3 border border-brass/30" />
        </div>

        <motion.div style={{ y: shotY }} className={cn("relative py-10", flipped ? "pr-[6%]" : "pl-[6%]")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.shot} alt={`${s.eyebrow} in WorshipHQ`} loading="lazy" decoding="async" className="w-full drop-shadow-[0_30px_40px_rgba(11,43,38,0.35)]" />
        </motion.div>

        {s.phone && (
          <motion.div style={{ y: phoneY }} className={cn("absolute bottom-[-6%] w-[26%] min-w-[120px]", flipped ? "right-[2%]" : "left-[0%]")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.phone} alt="" loading="lazy" decoding="async" className="w-full drop-shadow-[0_30px_40px_rgba(11,43,38,0.45)]" />
          </motion.div>
        )}

        <motion.div style={{ y: chipY }} className={cn("absolute top-[4%] hidden items-center gap-2.5 rounded-full border border-ink/10 bg-parchment px-4 py-2.5 text-sm font-medium text-ink shadow-[0_18px_40px_-18px_rgba(11,43,38,0.6)] sm:flex", flipped ? "left-[4%]" : "right-[2%]")}>
          <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>
          {s.chip}
        </motion.div>
      </div>
    </div>
  );
}

export function Spotlights() {
  return (
    <section className="relative overflow-hidden py-12 sm:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <div className="mx-auto mb-16 max-w-2xl text-center sm:mb-24">
            <p className="rubric">See it for yourself</p>
            <h2 className="press-display mt-5 text-4xl sm:text-5xl">This is the real thing, <span className="text-primary">not a drawing.</span></h2>
            <p className="mt-5 text-[15px] leading-[1.8] text-ink-muted">Every screen below is WorshipHQ as your church office will use it.</p>
          </div>
        </Reveal>
        <div className="flex flex-col gap-28 sm:gap-40">
          {spotlights.map((s, i) => <SpotlightRow key={s.title} s={s} i={i} />)}
        </div>
      </div>
    </section>
  );
}
