"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotionSafe as useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  ArrowRight, ChevronLeft, ChevronRight, HandCoins, MessageSquare, PlayCircle, ScanFace, Hand, Fingerprint,
  Check, PhoneCall, Cake, UserCheck, Send,
} from "lucide-react";
import type { LandingStat } from "@/lib/landing-stats-shared";
import { AnimatedNumber } from "@/components/ui/animated-number";

const ease = [0.22, 1, 0.36, 1] as const;
const SLIDE_MS = 9000;

const DEFAULT_SUBHEAD =
  "Members, giving, attendance, events, messaging - one calm headquarters for everything your church runs.";

/** The four slides. `image` null = the engraved gradient backdrop (the product slide needs no photo behind it). */
const SLIDES = [
  { id: "dashboard", label: "One dashboard", image: null, alt: "" },
  { id: "door", label: "At the door", image: "/marketing/hero-sanctuary.webp", alt: "Church interior" },
  { id: "reach", label: "Reach everyone", image: "/marketing/hero-media-desk.webp", alt: "Church media team at the production desk" },
  { id: "welcome", label: "Welcome home", image: "/marketing/hero-worship.webp", alt: "Congregation in worship" },
] as const;

const FEATURE_PILLS = [
  { icon: HandCoins, label: "Mobile Money giving" },
  { icon: MessageSquare, label: "One text, every member" },
  { icon: ScanFace, label: "Face & fingerprint check-in" },
  { icon: PhoneCall, label: "Absentees called the same day" },
];

/* ───────────────────────── Headline: each line rises out of a mask ───────────────────────── */

function Lines({ lines, as: Tag = "h2", className }: { lines: React.ReactNode[]; as?: "h1" | "h2"; className?: string }) {
  return (
    <Tag className={className}>
      {lines.map((l, i) => (
        <span key={i} className="block overflow-hidden pb-[0.12em]">
          <motion.span className="block" initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ duration: 0.9, delay: 0.08 + i * 0.12, ease }}>
            {l}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

const fadeUp = (delay: number) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay, ease } });

/* ───────────────────────── Slide 1: the real dashboard, with things happening on it ───────────────────────── */

const DASH_CHIPS = [
  { icon: UserCheck, text: "Ama Owusu checked in", sub: "Sunday Service · by face", pos: "left-[-6%] top-[14%]", delay: 0.6 },
  { icon: HandCoins, text: "GHS 200 tithe recorded", sub: "Receipt texted to Kwame", pos: "right-[-4%] top-[40%]", delay: 2.2 },
  { icon: Cake, text: "Birthday text sent", sub: "to Esi Appiah, 8:00am", pos: "left-[4%] bottom-[8%]", delay: 3.8 },
];

function DashboardVisual() {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto w-full max-w-[680px]" style={{ perspective: 1800 }} aria-hidden>
      <motion.div
        initial={{ opacity: 0, rotateY: -22, rotateX: 10, y: 50 }}
        animate={{ opacity: 1, rotateY: -11, rotateX: 4, y: 0 }}
        transition={{ duration: 1.2, delay: 0.2, ease }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <motion.div animate={reduce ? undefined : { y: [0, -10, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marketing/app/dashboard.webp" alt="" width={1500} height={924} className="w-full drop-shadow-[0_50px_60px_rgba(0,0,0,0.55)]" />
        </motion.div>
      </motion.div>
      {DASH_CHIPS.map((c) => (
        <motion.div
          key={c.text}
          className={`absolute ${c.pos} flex items-center gap-3 rounded-2xl border border-ink/10 bg-parchment/95 px-4 py-3 text-ink shadow-[0_24px_50px_-18px_rgba(0,0,0,0.6)] backdrop-blur`}
          initial={{ opacity: 0, y: 16, scale: 0.92 }}
          animate={reduce ? { opacity: 1, y: 0, scale: 1 } : { opacity: [0, 1, 1, 0], y: [16, 0, 0, -10], scale: [0.92, 1, 1, 0.98] }}
          transition={reduce ? { delay: c.delay } : { duration: 6.5, times: [0, 0.08, 0.82, 1], delay: c.delay, repeat: Infinity, repeatDelay: 1.2, ease: "easeOut" }}
        >
          <span className="grid size-9 place-items-center rounded-full bg-evergreen text-parchment"><c.icon className="size-4" /></span>
          <span>
            <span className="block text-sm font-semibold leading-tight">{c.text}</span>
            <span className="block text-xs text-ink-muted">{c.sub}</span>
          </span>
        </motion.div>
      ))}
    </div>
  );
}

/* ───────────────────────── Slide 2: Sunday morning at the door ───────────────────────── */

/** Names are examples for the illustration, not real members. */
const ARRIVALS = [
  { name: "Ama Owusu", how: "Face", icon: ScanFace },
  { name: "Kwame Boateng", how: "Fingerprint", icon: Fingerprint },
  { name: "Esi Appiah", how: "Palm", icon: Hand },
  { name: "Yaw Darko", how: "Face", icon: ScanFace },
  { name: "Abena Mensah", how: "Fingerprint", icon: Fingerprint },
  { name: "Kofi Asante", how: "Palm", icon: Hand },
];

export function DoorScene() {
  const reduce = useReducedMotion();
  const [n, setN] = useState(3);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setN((x) => x + 1), 2400);
    return () => clearInterval(t);
  }, [reduce]);
  const current = ARRIVALS[n % ARRIVALS.length]!;
  const recent = Array.from({ length: 4 }, (_, i) => ARRIVALS[(n - i + ARRIVALS.length * 10) % ARRIVALS.length]!);
  const present = 184 + n;

  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
      {/* The device at the door */}
      <motion.div initial={{ opacity: 0, y: 40, rotate: -3 }} animate={{ opacity: 1, y: 0, rotate: -2 }} transition={{ duration: 1, delay: 0.2, ease }}
        className="relative rounded-[2rem] border border-parchment/15 bg-[#0e1f1c] p-4 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)]">
        <div className="relative overflow-hidden rounded-[1.4rem] bg-gradient-to-b from-[#13302b] to-[#0b2420] p-6 text-center">
          <div className="relative mx-auto grid size-28 place-items-center">
            {/* Pulse ring each time someone is recognised */}
            {!reduce && (
              <motion.span key={`ring${n}`} className="absolute inset-0 rounded-full border border-brass/60" initial={{ scale: 0.7, opacity: 0.9 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 1.4, ease: "easeOut" }} />
            )}
            <div className="relative grid size-24 place-items-center overflow-hidden rounded-full border border-brass/40 bg-brass/10">
              <AnimatePresence mode="wait">
                <motion.div key={n} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.2, opacity: 0 }} transition={{ duration: 0.4, ease }}>
                  <current.icon className="size-11 text-brass" strokeWidth={1.4} />
                </motion.div>
              </AnimatePresence>
              {/* Scan line */}
              {!reduce && (
                <motion.span key={`scan${n}`} className="absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-emerald-300/40 to-transparent" initial={{ top: "-30%" }} animate={{ top: "110%" }} transition={{ duration: 0.9, ease: "easeInOut" }} />
              )}
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={`w${n}`} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.35, ease }}>
              <p className="mt-4 text-xs uppercase tracking-[0.2em] text-parchment/50">Welcome</p>
              <p className="mt-1 font-display text-2xl font-bold text-parchment">{current.name}</p>
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
                <Check className="size-3.5" /> Checked in by {current.how.toLowerCase()}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* What the office sees, live */}
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.5, ease }}
        className="relative -mt-6 ml-8 mr-[-1rem] rounded-2xl border border-ink/10 bg-parchment p-4 text-ink shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)] sm:ml-16">
        <div className="flex items-baseline justify-between">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>
            Sunday Service · live
          </span>
          <span className="font-display text-xl font-bold tabular-nums text-evergreen-deep">{present} present</span>
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
      </motion.div>
    </div>
  );
}

/* ───────────────────────── Slide 3: a member's phone through the week ───────────────────────── */

const THREAD = [
  { day: "Saturday · 6:00pm", text: "Shalom Ama! Join us this Sunday at 9am for our Thanksgiving Service. Come with your family. God bless you." },
  { day: "Sunday · 11:42am", text: "Thank you, Ama. We received your tithe of GHS 200 today. God bless you." },
  { day: "Wednesday · 8:00am", text: "Happy birthday, Ama! Grace Chapel celebrates you today. May this new year overflow with His goodness." },
];

function PhoneThread() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduce) return;
    // Odd steps show the "typing" dots, even steps the message. Then it rests and starts again.
    const wait = step >= THREAD.length * 2 ? 3600 : step % 2 === 0 ? 900 : 1300;
    const t = setTimeout(() => setStep((s) => (s >= THREAD.length * 2 ? 0 : s + 1)), wait);
    return () => clearTimeout(t);
  }, [step, reduce]);
  // With less motion asked for, the whole thread is simply there.
  const shown = reduce ? THREAD.length : Math.floor(step / 2);
  const typing = !reduce && step % 2 === 1 && shown < THREAD.length;

  return (
    <div className="relative mx-auto w-full max-w-[340px]" aria-hidden>
      <motion.div initial={{ opacity: 0, y: 50, rotate: 5 }} animate={{ opacity: 1, y: 0, rotate: 3 }} transition={{ duration: 1, delay: 0.2, ease }}
        className="rounded-[2.6rem] border border-parchment/15 bg-[#0d1513] p-3 shadow-[0_50px_100px_-30px_rgba(0,0,0,0.85)]">
        <div className="relative h-[470px] overflow-hidden rounded-[2rem] bg-parchment">
          <div className="absolute left-1/2 top-2.5 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-[#0d1513]" />
          <div className="border-b border-ink/10 px-5 pb-3 pt-11 text-center">
            <div className="mx-auto grid size-9 place-items-center rounded-full bg-evergreen text-xs font-bold text-parchment">GC</div>
            <div className="mt-1 text-xs font-semibold tracking-wide text-ink">GRACECHAPEL</div>
          </div>
          <div className="flex h-[360px] flex-col justify-end gap-3 px-4 pb-5">
            <AnimatePresence initial={false}>
              {THREAD.slice(0, shown).map((m) => (
                <motion.div key={m.day} layout initial={{ opacity: 0, y: 24, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }} transition={{ duration: 0.45, ease }}>
                  <div className="mb-1 text-center text-[10px] uppercase tracking-[0.14em] text-ink-faint">{m.day}</div>
                  <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13px] leading-snug text-ink shadow-sm ring-1 ring-ink/5">{m.text}</div>
                </motion.div>
              ))}
              {typing && (
                <motion.div key="typing" layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex w-14 items-center justify-center gap-1 rounded-2xl rounded-bl-md bg-white px-3 py-3 shadow-sm ring-1 ring-ink/5">
                  {[0, 1, 2].map((d) => (
                    <motion.span key={d} className="size-1.5 rounded-full bg-ink-faint" animate={{ y: [0, -3, 0] }} transition={{ duration: 0.7, repeat: Infinity, delay: d * 0.12 }} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
      <motion.div {...fadeUp(1)} className="absolute -left-24 top-44 hidden items-center gap-3 rounded-2xl border border-ink/10 bg-parchment px-4 py-3 text-ink shadow-[0_24px_50px_-18px_rgba(0,0,0,0.6)] xl:flex">
        <span className="grid size-9 place-items-center rounded-full bg-evergreen text-parchment"><Send className="size-4" /></span>
        <span><span className="block text-sm font-semibold leading-tight">Sent to 212 members</span><span className="block text-xs text-ink-muted">One tap, one message</span></span>
      </motion.div>
    </div>
  );
}

/* ───────────────────────── The slider ───────────────────────── */

export function Hero({
  subhead = DEFAULT_SUBHEAD,
  freeMembers = "up to 30 members",
  stats = [],
}: {
  subhead?: string;
  /** e.g. "up to 30 members" - pulled live from the SuperAdmin-editable plan config. */
  freeMembers?: string;
  /** The numbers shown on the last slide (the same ones as the bar under the hero). */
  stats?: LandingStat[];
}) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = useCallback((next: number) => {
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (paused || reduce) return;
    timer.current = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), SLIDE_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [paused, reduce, index]);

  const h = "font-display text-[2.6rem] font-bold leading-[1.02] tracking-tight text-parchment sm:text-5xl lg:text-[3.4rem] xl:text-[4rem]";
  const lead = "mt-6 max-w-lg text-base leading-relaxed text-parchment/80 sm:text-lg xl:text-xl";
  const primary = "group inline-flex items-center gap-2.5 rounded-full bg-parchment px-7 py-3.5 text-sm font-semibold text-evergreen-deep shadow-lg transition-colors hover:bg-white";
  const arrow = <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />;

  return (
    <section
      className="relative h-[100dvh] min-h-[640px] w-full overflow-hidden bg-evergreen-deep"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="WorshipHQ highlights"
    >
      {/* ── Backgrounds: a photo with a slow zoom, or the engraved gradient for the product slide ── */}
      <AnimatePresence>
        <motion.div key={SLIDES[index]!.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2, ease: "easeInOut" }} className="absolute inset-0" aria-hidden>
          {SLIDES[index]!.image ? (
            <>
              <motion.img src={SLIDES[index]!.image!} alt="" initial={{ scale: 1 }} animate={{ scale: 1.1 }} transition={{ duration: SLIDE_MS / 1000 + 2, ease: "linear" }} className="size-full object-cover" />
              <div className="absolute inset-0 bg-evergreen-deep/75" />
              <div className="absolute inset-0 bg-gradient-to-r from-evergreen-deep via-evergreen-deep/70 to-transparent" />
            </>
          ) : (
            <>
              <div className="absolute inset-0" style={{ background: "radial-gradient(90% 70% at 78% 38%, #1c5a4f 0%, #0f3a33 38%, #0b2b26 72%)" }} />
              {/* Engraved guide lines, like a ledger page */}
              <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(to right, #f6f1e6 1px, transparent 1px), linear-gradient(to bottom, #f6f1e6 1px, transparent 1px)", backgroundSize: "88px 88px", maskImage: "radial-gradient(70% 70% at 70% 40%, black, transparent)" }} />
            </>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-evergreen-deep via-transparent to-evergreen-deep/50" />
        </motion.div>
      </AnimatePresence>

      {/* A slow drifting light and a fine grain, on every slide */}
      {!reduce && (
        <motion.div aria-hidden className="pointer-events-none absolute -right-[10%] top-[8%] size-[55vw] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(151,116,42,0.55) 0%, transparent 65%)" }}
          animate={{ x: [0, -60, 20, 0], y: [0, 40, -20, 0] }} transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }} />
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />

      {/* ── Slide content ── */}
      <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-center px-6 pb-24 pt-20 lg:px-10">
        <AnimatePresence mode="wait">
          {index === 0 && (
            <motion.div key="s1" exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.45, ease }} className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
              <div>
                <motion.p {...fadeUp(0)} className="rubric !text-brass">The Church Management System</motion.p>
                <Lines as="h1" className={`mt-5 ${h}`} lines={["Your whole church.", <span key="b" className="text-brass">One dashboard.</span>]} />
                <motion.p {...fadeUp(0.45)} className={lead}>{subhead}</motion.p>
                <motion.div {...fadeUp(0.6)} className="mt-9 flex flex-wrap items-center gap-4">
                  <Link href="/sign-up" className={primary}>Get started free {arrow}</Link>
                  <Link href="/sign-in" className="group inline-flex items-center gap-2 text-sm font-medium text-parchment/90 transition-colors hover:text-white">
                    <PlayCircle className="size-4.5 text-brass" /> View live demo
                  </Link>
                </motion.div>
                <motion.p {...fadeUp(0.75)} className="mt-5 text-xs text-parchment/50">Free forever for {freeMembers} · no card needed · 14 days of free SMS</motion.p>
              </div>
              <div className="hidden lg:block"><DashboardVisual /></div>
            </motion.div>
          )}

          {index === 1 && (
            <motion.div key="s2" exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.45, ease }} className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
              <div>
                <motion.p {...fadeUp(0)} className="rubric !text-brass">Check-in at the door</motion.p>
                <Lines className={`mt-5 ${h}`} lines={["They walk in.", <span key="b" className="text-brass">Attendance takes itself.</span>]} />
                <motion.p {...fadeUp(0.45)} className={lead}>
                  A face, palm or fingerprint at the door, and every member is marked present by name. No register, no queue, no Monday typing.
                </motion.p>
                <motion.div {...fadeUp(0.6)} className="mt-9 flex flex-wrap items-center gap-4">
                  <Link href="/devices" className={primary}>See the devices {arrow}</Link>
                  <Link href="/contact" className="text-sm font-medium text-parchment/90 transition-colors hover:text-white">We supply and install them →</Link>
                </motion.div>
              </div>
              <div className="hidden lg:block"><DoorScene /></div>
            </motion.div>
          )}

          {index === 2 && (
            <motion.div key="s3" exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.45, ease }} className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <motion.p {...fadeUp(0)} className="rubric !text-brass">Texts, receipts and follow-up</motion.p>
                <Lines className={`mt-5 ${h}`} lines={["Stop chasing people.", <span key="b" className="text-brass">Start reaching them.</span>]} />
                <motion.p {...fadeUp(0.45)} className={lead}>
                  One text reaches every member, even the ones without data. Givers get a receipt on the spot, and the people who missed Sunday are on a leader&rsquo;s list by Monday.
                </motion.p>
                <div className="mt-8 grid max-w-lg grid-cols-2 gap-2.5">
                  {FEATURE_PILLS.map((f, i) => (
                    <motion.div key={f.label} {...fadeUp(0.6 + i * 0.08)} className="flex items-center gap-2.5 rounded-xl border border-parchment/15 bg-parchment/5 px-3.5 py-3 backdrop-blur-sm">
                      <f.icon className="size-4 shrink-0 text-brass" strokeWidth={1.75} />
                      <span className="text-xs font-medium leading-tight text-parchment/90 sm:text-sm">{f.label}</span>
                    </motion.div>
                  ))}
                </div>
                <motion.div {...fadeUp(0.95)} className="mt-8">
                  <Link href="/features" className="group inline-flex items-center gap-2 text-sm font-semibold text-parchment transition-colors hover:text-white">
                    Explore all features <ArrowRight className="size-4 text-brass transition-transform group-hover:translate-x-1" />
                  </Link>
                </motion.div>
              </div>
              <div className="hidden lg:block"><PhoneThread /></div>
            </motion.div>
          )}

          {index === 3 && (
            <motion.div key="s4" exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.45, ease }} className="mx-auto max-w-4xl text-center">
              <motion.p {...fadeUp(0)} className="rubric !text-brass">Built for the local church</motion.p>
              <Lines className="mt-5 font-display text-6xl font-bold leading-[1.02] tracking-tight text-parchment sm:text-7xl xl:text-8xl" lines={[<>Welcome <span className="text-brass">home.</span></>]} />
              <motion.p {...fadeUp(0.4)} className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-parchment/80 sm:text-lg xl:text-xl">
                From a fellowship of thirty to a church with branches, churches across Africa run their week on WorshipHQ. Start free today and grow one plan at a time.
              </motion.p>
              {stats.length > 0 && (
                <motion.div {...fadeUp(0.55)} className="mx-auto mt-9 flex max-w-2xl flex-wrap items-stretch justify-center divide-x divide-parchment/15 border-y border-parchment/15">
                  {stats.slice(0, 3).map((s) => (
                    <div key={s.key} className="px-6 py-4 sm:px-9">
                      <div className="font-display text-3xl font-bold text-parchment sm:text-4xl"><AnimatedNumber value={s.value} prefix={s.prefix} suffix={s.plus ? "+" : ""} /></div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-parchment/55">{s.label}</div>
                    </div>
                  ))}
                </motion.div>
              )}
              <motion.div {...fadeUp(0.7)} className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link href="/sign-up" className={`${primary} px-8 py-4`}>Start your church free {arrow}</Link>
                <Link href="/contact" className="inline-flex items-center gap-2 rounded-full border border-parchment/30 px-8 py-4 text-sm font-semibold text-parchment transition-colors hover:border-parchment/60 hover:bg-parchment/5">
                  Request a demo
                </Link>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Controls: named tabs with a filling line (dots on small screens) ── */}
      <div className="absolute inset-x-0 bottom-0 z-20">
        <div className="mx-auto flex max-w-7xl items-end gap-4 px-6 pb-6 lg:px-10">
          <div className="hidden flex-1 grid-cols-4 gap-5 md:grid" role="tablist" aria-label="Slides">
            {SLIDES.map((s, i) => (
              <button key={s.id} role="tab" aria-selected={i === index} onClick={() => go(i)} className="group text-left">
                <span className="relative block h-px w-full overflow-hidden bg-parchment/20">
                  {i === index && !paused && !reduce && (
                    <motion.span key={`p-${index}`} className="absolute inset-0 origin-left bg-brass" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: SLIDE_MS / 1000, ease: "linear" }} />
                  )}
                  {i === index && (paused || reduce) && <span className="absolute inset-0 bg-brass" />}
                </span>
                <span className="mt-3 flex items-baseline gap-2.5">
                  <span className={`font-mono text-[11px] ${i === index ? "text-brass" : "text-parchment/35"}`}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={`text-sm font-medium transition-colors ${i === index ? "text-parchment" : "text-parchment/45 group-hover:text-parchment/80"}`}>{s.label}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-1 items-center justify-center gap-2.5 md:hidden">
            {SLIDES.map((s, i) => (
              <button key={s.id} onClick={() => go(i)} aria-label={`Go to slide ${i + 1}`} className="relative h-1.5 overflow-hidden rounded-full bg-parchment/25 transition-all" style={{ width: i === index ? 44 : 16 }}>
                {i === index && <span className="absolute inset-0 rounded-full bg-brass" />}
              </button>
            ))}
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <button onClick={() => go(index - 1)} aria-label="Previous slide" className="grid size-10 place-items-center rounded-full border border-parchment/25 text-parchment/80 transition-colors hover:border-parchment/60 hover:text-white">
              <ChevronLeft className="size-4" />
            </button>
            <button onClick={() => go(index + 1)} aria-label="Next slide" className="grid size-10 place-items-center rounded-full border border-parchment/25 text-parchment/80 transition-colors hover:border-parchment/60 hover:text-white">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
