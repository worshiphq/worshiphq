"use client";

import { AnimatedNumber } from "@/components/ui/animated-number";
import { Reveal } from "@/components/ui/reveal";

const stats = [
  { label: "Churches onboarded", value: 480, suffix: "+" },
  { label: "Members managed", value: 320000, suffix: "+" },
  { label: "Giving processed", value: 14, prefix: "₵", suffix: "M+" },
  { label: "Messages delivered", value: 2.4, suffix: "M+", decimals: 1 },
];

export function TrustBar() {
  return (
    <section className="relative py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <div className="rule-engraved py-10 sm:py-12">
            <p className="rubric mb-10 text-center !text-[10px]">
              ✦ &nbsp; From the parish ledger &nbsp; ✦
            </p>

            <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
              {stats.map((s, i) => (
                <div
                  key={s.label}
                  className="relative text-center md:border-l md:border-ink/10 md:first:border-l-0"
                >
                  <div className="font-serif text-4xl font-semibold tracking-tight text-evergreen-deep sm:text-5xl">
                    <AnimatedNumber
                      value={s.value}
                      prefix={s.prefix}
                      suffix={s.suffix}
                      decimals={s.decimals ?? 0}
                    />
                  </div>
                  <div className="mx-auto mt-3 max-w-[10rem] text-[11px] uppercase tracking-[0.18em] text-ink-muted">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-10 text-center font-serif text-[11px] italic text-ink-faint">
              * figures are illustrative
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
