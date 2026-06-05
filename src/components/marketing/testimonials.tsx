import { Quote } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { testimonials } from "@/config/marketing";

export function Testimonials() {
  return (
    <section className="relative border-y border-line bg-surface/30 py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge variant="gold" className="mb-4">
            Loved by ministries
          </Badge>
          <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Churches are growing with WorshipHQ
          </h2>
          <p className="mt-3 text-sm text-ink-faint">Names and churches shown are illustrative placeholders.</p>
        </Reveal>

        <div className="mt-14 columns-1 gap-4 md:columns-2 lg:columns-3 [&>*]:mb-4">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={(i % 3) * 0.08}>
              <figure className="card-surface break-inside-avoid p-6">
                <Quote className="size-6 text-primary/40" />
                <blockquote className="mt-3 text-sm leading-relaxed text-ink">{t.quote}</blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  <Avatar name={t.name} size="sm" />
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs text-ink-muted">
                      {t.role} · {t.church}
                    </div>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
