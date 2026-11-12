"use client";

import { Reveal, StaggerGroup, StaggerItem } from "@/components/ui/reveal";
import { MessageSquare, ScanFace, HandCoins, Sunrise } from "lucide-react";

type Tier = "free" | "starter" | "pro" | "max";
const TIER_LABEL: Record<Tier, string> = { free: "Every plan", starter: "Starter", pro: "Pro", max: "Max" };

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

  return (
    <section className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="rubric">One Sunday with WorshipHQ</p>
            <h2 className="press-display mt-5 text-4xl sm:text-5xl">From Saturday&rsquo;s reminder to Monday&rsquo;s phone call.</h2>
            <p className="mt-5 text-[15px] leading-[1.8] text-ink-muted">Not another spreadsheet. The work your church already does every week, done once and done on time.</p>
          </div>
        </Reveal>
        <StaggerGroup className="relative mt-14 grid gap-6 md:grid-cols-4" stagger={0.1}>
          <div className="absolute left-0 right-0 top-[1.35rem] hidden h-px bg-gradient-to-r from-transparent via-brass/40 to-transparent md:block" aria-hidden />
          {moments.map((m) => (
            <StaggerItem key={m.when}>
              <div className="relative">
                <span className="relative z-10 grid size-11 place-items-center rounded-full border border-brass/40 bg-parchment text-evergreen">
                  <m.icon className="size-5" strokeWidth={1.6} />
                </span>
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brass">{m.when}</p>
                <h3 className="mt-2 font-display text-xl font-bold">{m.title}</h3>
                <p className="mt-2 text-sm leading-[1.75] text-ink-muted">{m.body}</p>
                <span className="mt-3 inline-block rounded-full border border-ink/10 px-2.5 py-0.5 text-[11px] font-medium text-ink-muted">{TIER_LABEL[m.plan]}</span>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
