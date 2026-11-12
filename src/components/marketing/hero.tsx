"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, ScanFace, Hand, Fingerprint, Check } from "lucide-react";

const ease = [0.22, 1, 0.36, 1] as const;

const DEFAULT_SUBHEAD =
  "A face, palm or fingerprint device at your door checks every member in by name. WorshipHQ handles the rest: the texts, the giving, the follow-up and Monday's numbers.";

/** An illustration of Sunday morning at the door. Names are examples, not real members. */
const ARRIVALS = [
  { name: "Ama Owusu", how: "Face", icon: ScanFace },
  { name: "Kwame Boateng", how: "Fingerprint", icon: Fingerprint },
  { name: "Esi Appiah", how: "Palm", icon: Hand },
  { name: "Yaw Darko", how: "Face", icon: ScanFace },
  { name: "Abena Mensah", how: "Fingerprint", icon: Fingerprint },
  { name: "Kofi Asante", how: "Palm", icon: Hand },
];

function DoorScene() {
  const reduce = useReducedMotion();
  const [n, setN] = useState(3);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setN((x) => x + 1), 2200);
    return () => clearInterval(t);
  }, [reduce]);
  const current = ARRIVALS[n % ARRIVALS.length]!;
  const recent = Array.from({ length: 4 }, (_, i) => ARRIVALS[(n - i + ARRIVALS.length * 10) % ARRIVALS.length]!);
  const present = 184 + n;

  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
      {/* The device at the door */}
      <div className="relative rounded-[2rem] border border-parchment/15 bg-[#0e1f1c] p-4 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)]">
        <div className="rounded-[1.4rem] bg-gradient-to-b from-[#13302b] to-[#0b2420] p-6 text-center">
          <div className="mx-auto grid size-24 place-items-center rounded-full border border-brass/40 bg-brass/10">
            <AnimatePresence mode="wait">
              <motion.div key={n} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.2, opacity: 0 }} transition={{ duration: 0.4, ease }}>
                <current.icon className="size-11 text-brass" strokeWidth={1.4} />
              </motion.div>
            </AnimatePresence>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={`w${n}`} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.35, ease }}>
              <p className="mt-5 text-xs uppercase tracking-[0.2em] text-parchment/50">Welcome</p>
              <p className="mt-1 font-display text-2xl font-bold text-parchment">{current.name}</p>
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
                <Check className="size-3.5" /> Checked in by {current.how.toLowerCase()}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* What the office sees, live */}
      <div className="relative -mt-6 ml-8 mr-[-1rem] rounded-2xl border border-ink/10 bg-parchment p-4 text-ink shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)] sm:ml-16">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Sunday Service · live</span>
          <span className="font-display text-xl font-bold text-evergreen-deep tabular-nums">{present} present</span>
        </div>
        <ul className="mt-3 space-y-1.5">
          <AnimatePresence initial={false}>
            {recent.map((p, i) => (
              <motion.li key={`${p.name}-${n - i}`} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1 - i * 0.18, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease }}
                className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-500" />{p.name}</span>
                <span className="text-xs text-ink-faint">{p.how}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}

export function Hero({
  subhead = DEFAULT_SUBHEAD,
  freeMembers = "up to 30 members",
}: {
  subhead?: string;
  /** e.g. "up to 30 members" - pulled live from the SuperAdmin-editable plan config. */
  freeMembers?: string;
}) {
  return (
    <section className="relative overflow-hidden bg-evergreen-deep pb-20 pt-28 sm:pt-32 lg:min-h-[100dvh] lg:pb-24">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/marketing/hero-worship.webp" alt="" className="absolute inset-0 size-full object-cover opacity-25" />
      <div className="absolute inset-0 bg-gradient-to-r from-evergreen-deep via-evergreen-deep/90 to-evergreen-deep/60" />
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 50% at 75% 40%, rgba(151,116,42,0.18) 0%, transparent 70%)" }} />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease }}>
          <p className="rubric !text-brass">Church management, made in Ghana</p>
          <h1 className="mt-5 font-display text-[2.7rem] font-bold leading-[1.02] tracking-tight text-parchment sm:text-6xl xl:text-7xl">
            They walk in.
            <br />
            <span className="text-brass">Attendance takes itself.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-parchment/80 sm:text-lg">{subhead}</p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/sign-up" className="group inline-flex items-center gap-2.5 rounded-full bg-parchment px-7 py-3.5 text-sm font-semibold text-evergreen-deep shadow-lg transition-colors hover:bg-white">
              Start free
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link href="/devices" className="inline-flex items-center gap-2 rounded-full border border-parchment/30 px-7 py-3.5 text-sm font-semibold text-parchment transition-colors hover:border-parchment/60 hover:bg-parchment/5">
              See the door devices
            </Link>
          </div>
          <p className="mt-5 text-xs text-parchment/55">Free forever for {freeMembers}. No card needed. New churches get 14 days of free SMS.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.2, ease }}>
          <DoorScene />
        </motion.div>
      </div>
    </section>
  );
}
