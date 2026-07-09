"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight, ChevronLeft, ChevronRight, HandCoins, MessageSquare,
  CalendarCheck, QrCode, PlayCircle,
} from "lucide-react";
import { LaptopFrame } from "./laptop-frame";
import { DashboardMockup } from "./dashboard-mockup";

const ease = [0.22, 1, 0.36, 1] as const;
const SLIDE_MS = 8000;

const DEFAULT_SUBHEAD =
  "Members, giving, attendance, events, messaging — one calm headquarters for everything your church runs.";

const SLIDES = [
  {
    id: "dashboard",
    image: "https://images.unsplash.com/photo-1563330232-57114bb0823c?w=2000&q=80&auto=format",
    alt: "Church media team at the production desk",
  },
  {
    id: "features",
    image: "https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=2000&q=80&auto=format",
    alt: "Church interior",
  },
  {
    id: "welcome",
    image: "https://images.unsplash.com/photo-1478147427282-58a87a120781?w=2000&q=80&auto=format",
    alt: "Congregation in worship",
  },
] as const;

const FEATURE_PILLS = [
  { icon: HandCoins, label: "Mobile Money giving" },
  { icon: MessageSquare, label: "SMS to the whole church" },
  { icon: CalendarCheck, label: "Attendance & events" },
  { icon: QrCode, label: "QR member check-in" },
];

export function Hero({ subhead = DEFAULT_SUBHEAD }: { subhead?: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = useCallback((next: number) => {
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    timer.current = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), SLIDE_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [paused, index]);

  return (
    <section
      className="relative h-[100dvh] min-h-[600px] w-full overflow-hidden bg-evergreen-deep"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="WorshipHQ highlights"
    >
      {/* ── Backgrounds (crossfade + slow zoom) ── */}
      {SLIDES.map((s, i) => (
        <div key={s.id} className="absolute inset-0" aria-hidden={i !== index}>
          <AnimatePresence>
            {i === index && (
              <motion.div
                key={s.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.1, ease: "easeInOut" }}
                className="absolute inset-0"
              >
                <motion.img
                  src={s.image}
                  alt={s.alt}
                  initial={{ scale: 1 }}
                  animate={{ scale: 1.08 }}
                  transition={{ duration: SLIDE_MS / 1000 + 2, ease: "linear" }}
                  className="size-full object-cover"
                />
                {/* Readability overlays */}
                <div className="absolute inset-0 bg-evergreen-deep/72" />
                <div className="absolute inset-0 bg-gradient-to-t from-evergreen-deep via-evergreen-deep/30 to-evergreen-deep/60" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}

      {/* ── Slide content ── */}
      <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-center px-5 pt-16">
        <AnimatePresence mode="wait">
          {index === 0 && (
            <motion.div
              key="s1"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.7, ease }}
              className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]"
            >
              <div>
                <p className="rubric !text-brass">The Church Management System</p>
                <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight text-parchment sm:text-5xl xl:text-6xl">
                  Your whole church.
                  <br />
                  <span className="text-brass">One dashboard.</span>
                </h1>
                <p className="mt-6 max-w-md text-base leading-relaxed text-parchment/80 sm:text-lg">
                  {subhead}
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-4">
                  <Link
                    href="/sign-up"
                    className="group inline-flex items-center gap-2.5 rounded-full bg-parchment px-7 py-3.5 text-sm font-semibold text-evergreen-deep shadow-lg transition-colors hover:bg-white"
                  >
                    Get started free
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link
                    href="/sign-in"
                    className="group inline-flex items-center gap-2 text-sm font-medium text-parchment/90 transition-colors hover:text-white"
                  >
                    <PlayCircle className="size-4.5 text-brass" />
                    View live demo
                  </Link>
                </div>
                <p className="mt-5 text-xs text-parchment/50">
                  Free forever for up to 50 members · no credit card required
                </p>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.9, delay: 0.25, ease }}
                className="hidden lg:block"
              >
                <LaptopFrame>
                  <DashboardMockup />
                </LaptopFrame>
              </motion.div>
            </motion.div>
          )}

          {index === 1 && (
            <motion.div
              key="s2"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.7, ease }}
              className="mx-auto max-w-3xl text-center"
            >
              <p className="rubric !text-brass">Everything built in</p>
              <h2 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight text-parchment sm:text-5xl xl:text-6xl">
                Giving, attendance & SMS.
                <br />
                <span className="text-brass">No extra tools needed.</span>
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-parchment/80 sm:text-lg">
                Accept Mobile Money and card giving, check members in with a QR
                scan, and reach your whole congregation by SMS — from one place.
              </p>
              <div className="mx-auto mt-10 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
                {FEATURE_PILLS.map((f, i) => (
                  <motion.div
                    key={f.label}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 + i * 0.1, ease }}
                    className="flex flex-col items-center gap-2.5 rounded-2xl border border-parchment/15 bg-parchment/5 px-3 py-5 backdrop-blur-sm"
                  >
                    <f.icon className="size-5 text-brass" strokeWidth={1.75} />
                    <span className="text-xs font-medium leading-tight text-parchment/90">{f.label}</span>
                  </motion.div>
                ))}
              </div>
              <div className="mt-10">
                <Link
                  href="/features"
                  className="group inline-flex items-center gap-2 text-sm font-semibold text-parchment transition-colors hover:text-white"
                >
                  Explore all features
                  <ArrowRight className="size-4 text-brass transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </motion.div>
          )}

          {index === 2 && (
            <motion.div
              key="s3"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.7, ease }}
              className="mx-auto max-w-3xl text-center"
            >
              <p className="rubric !text-brass">Built for the local church</p>
              <h2 className="mt-5 font-display text-5xl font-bold leading-[1.02] tracking-tight text-parchment sm:text-6xl xl:text-7xl">
                Welcome home.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-parchment/80 sm:text-lg">
                From a 30-member fellowship to a multi-campus ministry — churches
                around the world run their week on WorshipHQ. Yours can too,
                starting today.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/sign-up"
                  className="group inline-flex items-center gap-2.5 rounded-full bg-parchment px-8 py-4 text-sm font-semibold text-evergreen-deep shadow-lg transition-colors hover:bg-white"
                >
                  Start your church free
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 rounded-full border border-parchment/30 px-8 py-4 text-sm font-semibold text-parchment transition-colors hover:border-parchment/60 hover:bg-parchment/5"
                >
                  Request a demo
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Controls ── */}
      <div className="absolute inset-x-0 bottom-8 z-20 flex items-center justify-center gap-6">
        <button
          onClick={() => go(index - 1)}
          aria-label="Previous slide"
          className="grid size-10 place-items-center rounded-full border border-parchment/25 text-parchment/80 transition-colors hover:border-parchment/60 hover:text-white"
        >
          <ChevronLeft className="size-4" />
        </button>

        <div className="flex items-center gap-2.5">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => go(i)}
              aria-label={`Go to slide ${i + 1}`}
              className="group relative h-1.5 overflow-hidden rounded-full bg-parchment/25 transition-all"
              style={{ width: i === index ? 44 : 16 }}
            >
              {i === index && !paused && (
                <motion.span
                  key={`progress-${index}`}
                  initial={{ x: "-100%" }}
                  animate={{ x: "0%" }}
                  transition={{ duration: SLIDE_MS / 1000, ease: "linear" }}
                  className="absolute inset-0 rounded-full bg-brass"
                />
              )}
              {i === index && paused && <span className="absolute inset-0 rounded-full bg-brass" />}
            </button>
          ))}
        </div>

        <button
          onClick={() => go(index + 1)}
          aria-label="Next slide"
          className="grid size-10 place-items-center rounded-full border border-parchment/25 text-parchment/80 transition-colors hover:border-parchment/60 hover:text-white"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Slide counter */}
      <div className="absolute bottom-9 right-6 z-20 hidden font-mono text-xs tracking-widest text-parchment/50 sm:block">
        {String(index + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
      </div>
    </section>
  );
}
