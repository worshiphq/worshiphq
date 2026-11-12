"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { ArrowRight, Fingerprint, Hand, ScanFace, Wrench } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion";

const ease = [0.22, 1, 0.36, 1] as const;

/** The door devices: what they do, the real check-in screen, and that we supply and install them. */
export function DevicesCallout() {
  const ways = [
    { icon: ScanFace, label: "Face", text: "Look at the device. Checked in." },
    { icon: Hand, label: "Palm", text: "Hold up a hand. Nothing to touch." },
    { icon: Fingerprint, label: "Fingerprint", text: "One touch at the door." },
  ];
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionSafe();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const shotY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [60, -60]);
  const rotate = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [4, -2]);

  return (
    <section ref={ref} className="relative overflow-hidden bg-evergreen-deep py-20 text-parchment sm:py-28">
      {/* Atmosphere: a brass glow, ledger lines and gilt rules */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 60% at 80% 50%, rgba(151,116,42,0.22) 0%, transparent 70%)" }} aria-hidden />
      <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "linear-gradient(to right, #f6f1e6 1px, transparent 1px), linear-gradient(to bottom, #f6f1e6 1px, transparent 1px)", backgroundSize: "88px 88px" }} aria-hidden />
      <div className="absolute inset-x-0 top-3 h-px bg-brass/40" aria-hidden />
      <div className="absolute inset-x-0 bottom-3 h-px bg-brass/40" aria-hidden />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <Reveal>
            <p className="rubric !text-brass">At the door</p>
            <h2 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              No register.
              <br />
              <span className="text-brass">No queue.</span>
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-[1.8] text-parchment/75">
              Members check in with a face, palm or fingerprint as they arrive, and attendance fills in by name before the first song.
              We supply the devices, install them at your entrance and set everything up, for a one-off fee.
            </p>
          </Reveal>

          <div className="mt-8 grid max-w-md gap-2.5">
            {ways.map((w, i) => (
              <motion.div key={w.label} initial={{ opacity: 0, x: -24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, delay: 0.15 + i * 0.1, ease }}
                className="flex items-center gap-4 border border-parchment/12 bg-parchment/[0.04] px-4 py-3 transition-colors hover:border-brass/50 hover:bg-parchment/[0.08]">
                <w.icon className="size-6 shrink-0 text-brass" strokeWidth={1.4} />
                <span className="font-display text-lg font-bold">{w.label}</span>
                <span className="ml-auto text-right text-sm text-parchment/65">{w.text}</span>
              </motion.div>
            ))}
          </div>

          <Reveal delay={0.2}>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/devices" className="group inline-flex items-center gap-2 rounded-full bg-parchment px-6 py-3 text-sm font-semibold text-evergreen-deep hover:bg-white">
                How the devices work <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/contact" className="inline-flex items-center gap-2 rounded-full border border-parchment/30 px-6 py-3 text-sm font-semibold hover:border-parchment/60">
                <Wrench className="size-4 text-brass" /> Get a price for your church
              </Link>
            </div>
            <p className="mt-4 text-xs text-parchment/50">Part of the Max plan. We supply and install the device for a one-off fee.</p>
          </Reveal>
        </div>

        {/* The real check-in screen: names arriving with how each person checked in */}
        <div className="relative" style={{ perspective: 1600 }}>
          <motion.div style={{ y: shotY, rotateY: -8, rotateX: 3, rotateZ: rotate }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marketing/app/service-checkin.webp" alt="The live check-in screen in WorshipHQ, with members marked present by fingerprint" loading="lazy" decoding="async" className="w-full drop-shadow-[0_50px_60px_rgba(0,0,0,0.6)] lg:w-[118%] lg:max-w-none" />
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.85, y: 20 }} whileInView={{ opacity: 1, scale: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.7, delay: 0.4, ease }}
            className="absolute -bottom-4 left-[-2%] flex items-center gap-3 rounded-2xl border border-ink/10 bg-parchment px-4 py-3 text-ink shadow-[0_24px_50px_-18px_rgba(0,0,0,0.7)]">
            <span className="relative grid size-10 place-items-center rounded-full bg-evergreen text-parchment">
              <Fingerprint className="size-5" />
              {!reduce && <span className="absolute inset-0 animate-ping rounded-full border border-evergreen opacity-40" />}
            </span>
            <span><span className="block text-sm font-semibold leading-tight">75 present, by name</span><span className="block text-xs text-ink-muted">before the first song</span></span>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
