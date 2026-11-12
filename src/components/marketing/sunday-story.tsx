"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { MessageSquare, ScanFace, HandCoins, Sunrise } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion";

type Tier = "free" | "starter" | "pro" | "max";
const TIER_LABEL: Record<Tier, string> = { free: "Every plan", starter: "Starter", pro: "Pro", max: "Max" };
const ease = [0.22, 1, 0.36, 1] as const;

/** One Sunday, start to finish. Each moment names the plan it comes with (read live from the plan settings). */
export function SundayStory({ tiers }: { tiers: Record<string, Tier> }) {
  const t = (f: string, fallback: Tier): Tier => tiers[f] ?? fallback;
  const moments = [
    {
      when: "Saturday evening",
      icon: MessageSquare,
      title: "Everyone gets the reminder",
      body: "One text reaches the whole church, even members without a smartphone. Their name in every message if you like.",
      plan: t("sms", "starter"),
    },
    {
      when: "Sunday, at the door",
      icon: ScanFace,
      title: "The door knows them",
      body: "A face, palm or fingerprint device checks each member in by name. No register, no queue. Every plan can also mark people present by name.",
      plan: t("biometric-devices", "max"),
    },
    {
      when: "During the service",
      icon: HandCoins,
      title: "The offering is counted once",
      body: "Tithes, offerings and Day Born recorded as they come in, with a receipt texted to each giver. Online giving by Mobile Money on Pro.",
      plan: t("auto-receipts", "starter"),
    },
    {
      when: "Monday morning",
      icon: Sunrise,
      title: "Nobody slips away quietly",
      body: "The regulars who missed are on a list for a leader to call. On Max, the pastor gets Sunday's numbers on their phone before breakfast.",
      plan: t("follow-ups", "starter"),
    },
  ];

  // The line across the four moments draws itself as the section scrolls through the screen.
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionSafe();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 55%"] });
  const drawn = useSpring(useTransform(scrollYProgress, [0, 1], [0, 1]), { stiffness: 90, damping: 24 });

  return (
    <section className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="rubric">One Sunday with WorshipHQ</p>
            <h2 className="press-display mt-5 text-4xl sm:text-5xl">From Saturday&rsquo;s reminder <span className="text-primary">to Monday&rsquo;s phone call.</span></h2>
            <p className="mt-5 text-[15px] leading-[1.8] text-ink-muted">Not another spreadsheet. The work your church already does every week, done once and done on time.</p>
          </div>
        </Reveal>

        <div ref={ref} className="relative mt-16 grid gap-10 md:grid-cols-4 md:gap-6">
          {/* The line: faint all the way, brass as far as you have scrolled */}
          <div className="absolute left-[1.35rem] top-0 h-full w-px bg-ink/10 md:left-0 md:top-[1.35rem] md:h-px md:w-full" aria-hidden />
          <motion.div className="absolute left-[1.35rem] top-0 h-full w-px origin-top bg-brass md:hidden" style={reduce ? undefined : { scaleY: drawn }} aria-hidden />
          <motion.div className="absolute left-0 top-[1.35rem] hidden h-px w-full origin-left bg-brass md:block" style={reduce ? undefined : { scaleX: drawn }} aria-hidden />
          {moments.map((m, i) => (
            <motion.div
              key={m.when}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7, delay: i * 0.12, ease }}
              className="group relative pl-16 md:pl-0"
            >
              <motion.span
                initial={{ scale: 0.6, backgroundColor: "#f6f1e6" }}
                whileInView={{ scale: 1, backgroundColor: "#123d36" }}
                viewport={{ once: true, margin: "-120px" }}
                transition={{ duration: 0.6, delay: 0.25 + i * 0.12, ease }}
                className="absolute left-0 top-0 z-10 grid size-11 place-items-center rounded-full border border-brass/50 text-brass md:relative"
              >
                <m.icon className="size-5" strokeWidth={1.6} />
              </motion.span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brass md:mt-6">{m.when}</p>
              <h3 className="mt-2 font-display text-xl font-bold">{m.title}</h3>
              <p className="mt-2 text-sm leading-[1.75] text-ink-muted">{m.body}</p>
              <span className="mt-4 inline-block rounded-full border border-ink/10 bg-parchment px-2.5 py-0.5 text-[11px] font-medium text-ink-muted transition-colors group-hover:border-brass/50 group-hover:text-ink">{TIER_LABEL[m.plan]}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
