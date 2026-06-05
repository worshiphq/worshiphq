import { Check } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { Badge } from "@/components/ui/badge";
import { spotlights } from "@/config/marketing";
import { cn } from "@/lib/utils";

export function Spotlights() {
  return (
    <section className="relative py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-24 px-5 py-12">
        {spotlights.map((s, i) => {
          const flipped = i % 2 === 1;
          return (
            <div key={s.title} className="grid items-center gap-10 lg:grid-cols-2">
              <Reveal className={cn(flipped && "lg:order-2")}>
                <Badge variant="gold" className="mb-4">
                  {s.eyebrow}
                </Badge>
                <h3 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{s.title}</h3>
                <p className="mt-4 text-lg text-ink-muted">{s.body}</p>
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-sm text-ink">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary-bright">
                        <Check className="size-3" />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal delay={0.1} className={cn(flipped && "lg:order-1")}>
                <figure className="group relative overflow-hidden rounded-3xl border border-line bg-surface">
                  <div className="absolute inset-0 z-10 bg-gradient-to-t from-base/80 via-transparent to-transparent" />
                  <div className="absolute inset-0 z-10 ring-1 ring-inset ring-white/5" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.image}
                    alt={s.title}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <figcaption className="absolute bottom-4 left-4 z-20 rounded-xl border border-line bg-base/70 px-3 py-2 text-xs text-ink-muted backdrop-blur">
                    {s.eyebrow} · WorshipHQ
                  </figcaption>
                </figure>
              </Reveal>
            </div>
          );
        })}
      </div>
    </section>
  );
}
