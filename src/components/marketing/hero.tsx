"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight, ChevronLeft, ChevronRight, HandCoins, MessageSquare,
  PlayCircle, ScanFace, Hand, Fingerprint, Check, PhoneCall,
} from "lucide-react";
import { LaptopFrame } from "./laptop-frame";
import { DashboardMockup } from "./dashboard-mockup";

const ease = [0.22, 1, 0.36, 1] as const;
const SLIDE_MS = 8000;

const DEFAULT_SUBHEAD =
  "Members, giving, attendance, events, messaging - one calm headquarters for everything your church runs.";

const SLIDES = [
  {
    id: "dashboard",
    image: "/marketing/hero-media-desk.webp",
    alt: "Church media team at the production desk",
  },
  {
    id: "door",
    image: "/marketing/hero-worship.webp",
    alt: "Congregation arriving for worship",
  },
  {
    id: "features",
    image: "/marketing/hero-sanctuary.webp",
    alt: "Church interior",
  },
  {
    id: "welcome",
    image: "/marketing/hero-worship.webp",
    alt: "Congregation in worship",
  },
] as const;

const FEATURE_PILLS = [
  { icon: HandCoins, label: "Mobile Money giving" },
  { icon: MessageSquare, label: "One text, every member" },
  { icon: ScanFace, label: "Face & fingerprint check-in" },
  { icon: PhoneCall, label: "Absentees called the same day" },
];

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
  freeMembers = "up to 40 members",
}: {
  subhead?: string;
  /** e.g. "up to 40 members" - pulled live from the SuperAdmin-editable plan config. */
  freeMembers?: string;
}) {
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
      <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-center px-6 pt-16 lg:px-10">
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
                <h1 className="mt-5 font-display text-4xl font-bold leading-[1.04] tracking-tight text-parchment sm:text-5xl lg:text-6xl xl:text-7xl">
                  Your whole church.
                  <br />
                  <span className="text-brass">One dashboard.</span>
                </h1>
                <p className="mt-6 max-w-lg text-[1rem]/6 leading-relaxed text-parchment/80 sm:text-lg xl:text-xl">
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
                  Free forever for {freeMembers} · no card needed · 14 days of free SMS
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
              key="s-door"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.7, ease }}
              className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]"
            >
              <div>
                <p className="rubric !text-brass">New: check-in at the door</p>
                <h2 className="mt-5 font-display text-4xl font-bold leading-[1.04] tracking-tight text-parchment sm:text-5xl lg:text-6xl xl:text-7xl">
                  They walk in.
                  <br />
                  <span className="text-brass">Attendance takes itself.</span>
                </h2>
                <p className="mt-6 max-w-lg text-[1rem]/6 leading-relaxed text-parchment/80 sm:text-lg xl:text-xl">
                  A face, palm or fingerprint at the door, and every member is marked present by name. No register, no queue, no Monday typing.
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-4">
                  <Link href="/devices" className="group inline-flex items-center gap-2.5 rounded-full bg-parchment px-7 py-3.5 text-sm font-semibold text-evergreen-deep shadow-lg transition-colors hover:bg-white">
                    See the devices
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link href="/contact" className="text-sm font-medium text-parchment/90 transition-colors hover:text-white">
                    We supply and install them →
                  </Link>
                </div>
              </div>
              <div className="hidden lg:block">
                <DoorScene />
              </div>
            </motion.div>
          )}

          {index === 2 && (
            <motion.div
              key="s2"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.7, ease }}
              className="mx-auto max-w-4xl text-center"
            >
              <p className="rubric !text-brass">Everything built in</p>
              <h2 className="mt-5 font-display text-4xl font-bold leading-[1.04] tracking-tight text-parchment sm:text-5xl lg:text-6xl xl:text-7xl">
                Stop chasing people.
                <br />
                <span className="text-brass">Start reaching them.</span>
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-[1rem]/6 leading-relaxed text-parchment/80 sm:text-lg xl:text-xl">
                One text reaches every member, even the ones without data. Givers get a receipt
                on the spot, and the people who missed Sunday are on a leader&rsquo;s list by Monday.
              </p>
              <div className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3.5 sm:grid-cols-4">
                {FEATURE_PILLS.map((f, i) => (
                  <motion.div
                    key={f.label}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 + i * 0.1, ease }}
                    className="flex flex-col items-center gap-2.5 rounded-2xl border border-parchment/15 bg-parchment/5 px-3 py-5 backdrop-blur-sm"
                  >
                    <f.icon className="size-5 text-brass" strokeWidth={1.75} />
                    <span className="text-xs font-medium leading-tight text-parchment/90 xl:text-sm">{f.label}</span>
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

          {index === 3 && (
            <motion.div
              key="s3"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.7, ease }}
              className="mx-auto max-w-4xl text-center"
            >
              <p className="rubric !text-brass">Built for the local church</p>
              <h2 className="mt-5 font-display text-5xl font-bold leading-[1.02] tracking-tight text-parchment sm:text-6xl lg:text-7xl xl:text-8xl">
                Welcome home.
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-[1rem]/6 leading-relaxed text-parchment/80 sm:text-lg xl:text-xl">
                From a fellowship of thirty to a church with branches, churches across Africa
                run their week on WorshipHQ. Start free today and grow one plan at a time.
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
