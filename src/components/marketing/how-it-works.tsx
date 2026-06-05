import { Reveal } from "@/components/ui/reveal";
import { Badge } from "@/components/ui/badge";
import { steps } from "@/config/marketing";

export function HowItWorks() {
  return (
    <section className="relative overflow-hidden py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge variant="primary" className="mb-4">
            Up and running in a day
          </Badge>
          <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            From spreadsheets to a real command center
          </h2>
        </Reveal>

        <div className="relative mt-16 grid gap-6 md:grid-cols-3">
          {/* connecting line */}
          <div className="absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-line to-transparent md:block" />
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.12} className="relative">
              <div className="card-surface h-full p-7">
                <div className="mb-5 grid size-12 place-items-center rounded-2xl border border-primary/30 bg-primary/10 font-display text-lg font-bold text-primary-bright">
                  {s.n}
                </div>
                <h3 className="font-display text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
