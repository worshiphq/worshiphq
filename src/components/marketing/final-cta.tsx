"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";

export function FinalCTA() {
  return (
    <section className="relative px-5 py-20 sm:py-28">
      <Reveal>
        <div className="paper-panel relative mx-auto max-w-4xl border border-ink/12 px-6 py-16 text-center shadow-[0_30px_70px_-40px_rgba(28,26,22,0.45)] sm:px-12 sm:py-24">
          {/* Corner ticks */}
          <span className="absolute left-4 top-4 size-4 border-l-2 border-t-2 border-brass/50" aria-hidden />
          <span className="absolute right-4 top-4 size-4 border-r-2 border-t-2 border-brass/50" aria-hidden />
          <span className="absolute bottom-4 left-4 size-4 border-b-2 border-l-2 border-brass/50" aria-hidden />
          <span className="absolute bottom-4 right-4 size-4 border-b-2 border-r-2 border-brass/50" aria-hidden />

          <div className="relative">
            <p className="rubric">The Benediction</p>

            <h2 className="press-display mx-auto mt-6 max-w-2xl text-4xl sm:text-[3.4rem] sm:leading-[1.04]">
              Go, and run your church
              <br />
              <em className="font-light italic text-primary">in peace.</em>
            </h2>

            <p className="mx-auto mt-6 max-w-md text-[15px] leading-[1.8] text-ink-muted">
              Join churches around the world keeping every member, every cedi and
              every Sunday in one well-ordered place.
            </p>

            <div className="ornament-divider mx-auto my-9 max-w-[16rem] text-xs">✦</div>

            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/sign-up"
                className="group inline-flex items-center gap-2.5 rounded-full bg-evergreen px-8 py-4 text-sm font-semibold text-parchment shadow-[0_14px_30px_-12px_rgba(11,43,38,0.5)] transition-all hover:bg-evergreen-deep"
              >
                Get started free
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/sign-in"
                className="group inline-flex items-center gap-2 border-b border-ink/25 pb-0.5 text-sm font-medium text-ink transition-colors hover:border-brass hover:text-evergreen"
              >
                View the live demo
                <span className="text-brass transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            </div>

            <p className="mt-7 font-serif text-xs italic text-ink-faint">
              Free forever for up to 50 members · no credit card required
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
