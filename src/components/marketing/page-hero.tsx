export function PageHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle: string;
}) {
  return (
    <section className="paper-panel relative overflow-hidden pb-14 pt-32 sm:pt-40">
      {/* Engraved page margins */}
      <div className="pointer-events-none absolute inset-y-0 left-4 hidden w-px bg-ink/8 lg:block xl:left-10" aria-hidden />
      <div className="pointer-events-none absolute inset-y-0 right-4 hidden w-px bg-ink/8 lg:block xl:right-10" aria-hidden />

      <div className="relative mx-auto max-w-3xl px-5 text-center">
        <p className="rubric animate-fade-up">
          ✦ &nbsp; {eyebrow} &nbsp; ✦
        </p>
        <h1
          className="press-display mt-6 text-4xl sm:text-6xl animate-fade-up"
          style={{ animationDelay: "0.1s" }}
        >
          {title}
        </h1>
        <p
          className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink-muted animate-fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          {subtitle}
        </p>
        <div
          className="ornament-divider mx-auto mt-10 max-w-[14rem] text-xs animate-fade-up"
          style={{ animationDelay: "0.3s" }}
        >
          ✦
        </div>
      </div>
    </section>
  );
}
