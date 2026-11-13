/**
 * The opening band of every marketing sub-page. Dark evergreen like the homepage slider, so the site reads as one
 * piece: a brass glow, faint ledger lines, the page name, the headline and one line of explanation.
 *
 * Pages mark the accent part of their headline with `text-primary`; on this dark band it is shown in brass.
 * The site nav uses light text over it (see DARK_HERO_PATHS in site-nav.tsx): a new page that uses PageHero must be
 * added there.
 */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle: string;
  /** Optional extra under the subtitle, for example buttons. */
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-evergreen-deep pb-16 pt-32 text-parchment sm:pb-20 sm:pt-40">
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(70% 90% at 50% 0%, #1c5a4f 0%, #0f3a33 45%, #0b2b26 80%)" }} aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "linear-gradient(to right, #f6f1e6 1px, transparent 1px), linear-gradient(to bottom, #f6f1e6 1px, transparent 1px)",
          backgroundSize: "88px 88px",
          maskImage: "radial-gradient(75% 85% at 50% 30%, black, transparent)",
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute left-1/2 top-[-30%] size-[70vw] max-w-[900px] -translate-x-1/2 rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, rgba(151,116,42,0.5) 0%, transparent 62%)" }} aria-hidden />
      {/* Gilt rules along the bottom edge */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-brass/50" aria-hidden />
      <div className="absolute inset-x-0 bottom-1.5 h-px bg-brass/20" aria-hidden />

      <div className="relative mx-auto max-w-3xl px-5 text-center">
        <p className="rubric animate-fade-up !text-brass">✦ &nbsp; {eyebrow} &nbsp; ✦</p>
        <h1
          className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-parchment animate-fade-up sm:text-6xl [&_.text-primary]:!text-brass"
          style={{ animationDelay: "0.1s" }}
        >
          {title}
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-parchment/75 animate-fade-up" style={{ animationDelay: "0.2s" }}>
          {subtitle}
        </p>
        {children && (
          <div className="mt-9 animate-fade-up" style={{ animationDelay: "0.3s" }}>
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
