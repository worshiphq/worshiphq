/**
 * The opening band of every marketing sub-page. Dark evergreen like the homepage slider, so the site reads as one
 * piece: a brass glow, the page name, the headline and one line of explanation.
 *
 * Pages mark the accent part of their headline with `text-primary`; on this dark band it is shown in brass.
 * The site nav uses light text over it (see DARK_HERO_PATHS in site-nav.tsx): a new page that uses PageHero must be
 * added there.
 */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  photo,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle: string;
  /** A photo in public/marketing/bg, without its ending. Shown faintly, in the band's own green. */
  photo?: string;
  /** Optional extra under the subtitle, for example buttons. */
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-evergreen-deep pb-16 pt-32 text-parchment sm:pb-20 sm:pt-40">
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(70% 90% at 50% 0%, #1c5a4f 0%, #0f3a33 45%, #0b2b26 80%)" }} aria-hidden />
      {photo && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element -- a small, ready-sized file, so it needs no image server work */}
          <img src={`/marketing/bg/${photo}.webp`} alt="" decoding="async" className="size-full object-cover opacity-30 mix-blend-luminosity" />
          <div className="absolute inset-0" style={{ background: "radial-gradient(60% 75% at 50% 52%, rgba(11,43,38,0.78) 0%, rgba(11,43,38,0.2) 100%)" }} />
          <div className="absolute inset-0 bg-gradient-to-b from-evergreen-deep/60 via-transparent to-evergreen-deep/80" />
        </div>
      )}
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
