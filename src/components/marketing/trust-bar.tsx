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
    <section className="relative border-y border-line bg-surface/40 py-14">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mb-10 text-center text-xs uppercase tracking-[0.2em] text-ink-faint">
          Trusted by ministries across Ghana — figures illustrative
        </Reveal>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08} className="text-center">
              <div className="font-display text-4xl font-bold text-gradient-primary">
                <AnimatedNumber
                  value={s.value}
                  prefix={s.prefix}
                  suffix={s.suffix}
                  decimals={s.decimals ?? 0}
                />
              </div>
              <div className="mt-2 text-sm text-ink-muted">{s.label}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
