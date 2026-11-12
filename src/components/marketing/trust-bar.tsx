"use client";

import { AnimatedNumber } from "@/components/ui/animated-number";
import { Reveal } from "@/components/ui/reveal";
import type { LandingStat } from "@/lib/landing-stats-shared";

/** The numbers under the hero. They come from SuperAdmin, Content (live data by default). */
export function TrustBar({ stats }: { stats: LandingStat[] }) {
  if (stats.length === 0) return null;
  return (
    <section className="relative py-14 sm:py-16">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <div className="rule-engraved py-10">
            <p className="rubric mb-9 text-center !text-[10px]">✦ &nbsp; Churches already running on WorshipHQ &nbsp; ✦</p>
            <div className={`grid grid-cols-2 gap-x-6 gap-y-10 ${stats.length >= 4 ? "md:grid-cols-4" : stats.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
              {stats.map((s) => (
                <div key={s.key} className="relative text-center md:border-l md:border-ink/10 md:first:border-l-0">
                  <div className="font-display text-4xl font-bold tracking-tight text-evergreen-deep sm:text-5xl">
                    <AnimatedNumber value={s.value} prefix={s.prefix} suffix={s.plus ? "+" : ""} />
                  </div>
                  <div className="mx-auto mt-3 max-w-[11rem] text-[11px] uppercase tracking-[0.18em] text-ink-muted">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
