import type { ReactNode } from "react";
import { PageHero } from "@/components/marketing/page-hero";

/** Shared shell for Terms / Privacy / Refund pages — a readable prose column. */
export function LegalPage({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHero eyebrow={eyebrow} title={title} subtitle={`Last updated ${updated}`} />
      <section className="py-14 sm:py-16">
        <div className="legal-prose mx-auto max-w-2xl px-5">{children}</div>
      </section>
    </>
  );
}

/** One numbered/plain section. */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 font-display text-lg font-semibold text-ink">{heading}</h2>
      <div className="space-y-3 text-[15px] leading-[1.8] text-ink-muted">{children}</div>
    </section>
  );
}
