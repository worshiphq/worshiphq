import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, Users, Sparkles } from "lucide-react";
import { DocBody } from "@/components/docs/doc-body";
import { DocsSearch } from "@/components/docs/docs-search";
import { DOC_ARTICLES, DOC_SECTIONS, articlesIn, getArticle, neighbours } from "@/lib/docs";
import { searchEntries } from "@/lib/docs/search";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { getMinimumPlan } from "@/lib/plan-gate";

export function generateStaticParams() {
  return DOC_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) return { title: "Guide not found" };
  return { title: `${a.title} · User manual`, description: a.summary };
}

export default async function DocArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const section = DOC_SECTIONS.find((s) => s.id === article.section);
  const { prev, next } = neighbours(slug);

  // Plan badge comes from the live plan table, so it never drifts from billing.
  let planLabel: string | null = null;
  if (article.feature) {
    const cfg = await getPlatformConfig();
    const min = getMinimumPlan(article.feature, cfg.planTable);
    if (min !== "free") planLabel = cfg.planList.find((p) => p.id === min)?.name ?? min;
  }

  return (
    <div className="paper-panel min-h-screen pb-24 pt-28 sm:pt-32">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[250px_1fr]">
        {/* Sidebar: every section and guide */}
        <aside className="hidden lg:block">
          <nav className="sticky top-28 max-h-[calc(100vh-8rem)] space-y-6 overflow-y-auto pr-2 text-sm" aria-label="Manual contents">
            <Link href="/docs" className="flex items-center gap-1.5 font-semibold text-evergreen hover:underline">
              <ArrowLeft className="size-4" /> All guides
            </Link>
            {DOC_SECTIONS.map((s) => (
              <div key={s.id}>
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-faint">{s.title}</div>
                <ul className="space-y-0.5 border-l border-ink/10">
                  {articlesIn(s.id).map((a) => (
                    <li key={a.slug}>
                      <Link
                        href={`/docs/${a.slug}`}
                        aria-current={a.slug === slug ? "page" : undefined}
                        className={
                          a.slug === slug
                            ? "-ml-px block border-l-2 border-evergreen py-1 pl-3 font-semibold text-evergreen-deep"
                            : "block py-1 pl-3 text-ink-muted hover:text-evergreen-deep"
                        }
                      >
                        {a.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <article className="min-w-0">
          <div className="mb-6 max-w-2xl">
            <DocsSearch entries={searchEntries()} />
          </div>

          <p className="text-sm text-ink-faint">
            <Link href="/docs" className="hover:text-evergreen">Manual</Link>
            {section && <> / <Link href={`/docs#${section.id}`} className="hover:text-evergreen">{section.title}</Link></>}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-evergreen-deep sm:text-4xl">{article.title}</h1>
          <p className="mt-3 max-w-2xl text-lg text-ink-muted">{article.summary}</p>

          {(planLabel || article.who || article.appPath) && (
            <div className="mt-5 flex flex-wrap gap-2 text-[13px]">
              {planLabel && (
                <span className="inline-flex items-center gap-1.5 border border-evergreen/30 bg-evergreen/5 px-2.5 py-1 font-medium text-evergreen-deep">
                  <Sparkles className="size-3.5" /> {planLabel} plan and above
                </span>
              )}
              {article.who && (
                <span className="inline-flex items-center gap-1.5 border border-ink/15 px-2.5 py-1 text-ink-muted">
                  <Users className="size-3.5" /> {article.who}
                </span>
              )}
              {article.appPath && (
                <a href={article.appPath} className="inline-flex items-center gap-1.5 border border-ink/15 px-2.5 py-1 text-ink-muted hover:border-evergreen hover:text-evergreen">
                  <ExternalLink className="size-3.5" /> Open in WorshipHQ
                </a>
              )}
            </div>
          )}

          <div className="mt-8 max-w-3xl">
            <DocBody blocks={article.body} />
          </div>

          <div className="mt-14 grid max-w-3xl gap-3 border-t border-ink/10 pt-6 sm:grid-cols-2">
            {prev ? (
              <Link href={`/docs/${prev.slug}`} className="group border border-ink/10 p-4 hover:border-evergreen">
                <span className="flex items-center gap-1 text-xs text-ink-faint"><ArrowLeft className="size-3.5" /> Previous</span>
                <span className="mt-1 block font-semibold text-evergreen-deep group-hover:text-evergreen">{prev.title}</span>
              </Link>
            ) : <span />}
            {next && (
              <Link href={`/docs/${next.slug}`} className="group border border-ink/10 p-4 text-right hover:border-evergreen">
                <span className="flex items-center justify-end gap-1 text-xs text-ink-faint">Next <ArrowRight className="size-3.5" /></span>
                <span className="mt-1 block font-semibold text-evergreen-deep group-hover:text-evergreen">{next.title}</span>
              </Link>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
