import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { DocsSearch } from "@/components/docs/docs-search";
import { DOC_SECTIONS, articlesIn, DOC_ARTICLES } from "@/lib/docs";
import { searchEntries } from "@/lib/docs/search";

export const metadata: Metadata = {
  title: "User manual",
  description: "The complete, free WorshipHQ user manual: step-by-step guides for every feature.",
};

export default function DocsHome() {
  return (
    <>
      <PageHero
        eyebrow="User manual"
        title={
          <>
            Every feature,
            <br />
            <span className="text-primary">step by step.</span>
          </>
        }
        subtitle={`The complete WorshipHQ manual: ${DOC_ARTICLES.length} guides, free for every church.`}
      />

      <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <DocsSearch entries={searchEntries()} />
        </div>

        <div className="mt-14 space-y-14">
          {DOC_SECTIONS.map((s) => {
            const list = articlesIn(s.id);
            if (!list.length) return null;
            return (
              <div key={s.id} id={s.id} className="scroll-mt-28">
                <div className="flex items-end justify-between gap-4 border-t-2 border-evergreen pt-5">
                  <div>
                    <h2 className="font-display text-2xl font-bold text-evergreen-deep sm:text-3xl">{s.title}</h2>
                    <p className="mt-1 text-sm text-ink-muted">{s.blurb}</p>
                  </div>
                  <span className="hidden shrink-0 text-sm text-ink-faint sm:block">{list.length} guides</span>
                </div>
                <div className="mt-6 grid gap-x-10 gap-y-1 sm:grid-cols-2">
                  {list.map((a) => (
                    <Link key={a.slug} href={`/docs/${a.slug}`} className="group flex items-start gap-3 border-b border-ink/10 py-3.5">
                      <BookOpen className="mt-1 size-4 shrink-0 text-evergreen/70" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-evergreen-deep group-hover:text-evergreen">{a.title}</span>
                        <span className="block text-sm leading-snug text-ink-muted">{a.summary}</span>
                      </span>
                      <ArrowRight className="mt-1 size-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-evergreen" />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
