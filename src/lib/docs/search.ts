import { DOC_ARTICLES, DOC_SECTIONS } from "./index";
import { blocksToText } from "@/components/docs/doc-body";
import type { SearchEntry } from "@/components/docs/docs-search";

/** Lightweight search index handed to the client search box. */
export function searchEntries(): SearchEntry[] {
  const sectionTitle = new Map(DOC_SECTIONS.map((s) => [s.id, s.title]));
  return DOC_ARTICLES.map((a) => ({
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    section: sectionTitle.get(a.section) ?? "",
    text: blocksToText(a.body).slice(0, 1500),
  }));
}
