import { Reveal, StaggerGroup, StaggerItem } from "@/components/ui/reveal";
import { Badge } from "@/components/ui/badge";
import { featureCards } from "@/config/marketing";

export function FeatureGrid() {
  return (
    <section id="features" className="relative py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge variant="primary" className="mb-4">
            One platform, every ministry
          </Badge>
          <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Everything your church runs on,
            <span className="text-gradient-primary"> beautifully connected</span>
          </h2>
          <p className="mt-4 text-lg text-ink-muted">
            Stop juggling spreadsheets, WhatsApp groups and notebooks. WorshipHQ brings your people,
            giving and communications into one calm headquarters.
          </p>
        </Reveal>

        <StaggerGroup className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featureCards.map((f) => (
            <StaggerItem key={f.title}>
              <article className="group card-surface h-full p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30">
                <div className="mb-4 grid size-11 place-items-center rounded-xl border border-line bg-surface-2 text-primary-bright transition-colors group-hover:border-primary/40 group-hover:bg-primary/10">
                  <f.icon className="size-5" />
                </div>
                <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.blurb}</p>
              </article>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
