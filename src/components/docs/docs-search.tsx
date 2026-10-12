"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowRight } from "lucide-react";

export type SearchEntry = { slug: string; title: string; summary: string; section: string; text: string };

/** Instant search across every manual article (titles, summaries and full text). */
export function DocsSearch({ entries, autoFocus = false }: { entries: SearchEntry[]; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return entries
      .map((e) => {
        const title = e.title.toLowerCase();
        const hay = `${title} ${e.summary.toLowerCase()} ${e.text.toLowerCase()}`;
        if (!words.every((w) => hay.includes(w))) return null;
        const score = words.reduce((s, w) => s + (title.includes(w) ? 5 : 0) + (e.summary.toLowerCase().includes(w) ? 2 : 0), 0);
        return { e, score };
      })
      .filter((x): x is { e: SearchEntry; score: number } => !!x)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((x) => x.e);
  }, [q, entries]);

  return (
    <div className="relative">
      <div className="flex items-center gap-3 border-2 border-evergreen bg-white px-4 py-3">
        <Search className="size-5 shrink-0 text-evergreen" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus={autoFocus}
          placeholder="Search the manual, e.g. “add a member”, “harvest envelopes”, “fingerprint”"
          aria-label="Search the manual"
          className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
      {q.trim() && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-[60vh] overflow-y-auto border border-ink/15 bg-white shadow-xl">
          {results.length === 0 ? (
            <p className="px-4 py-5 text-sm text-ink-muted">No guide matches &ldquo;{q}&rdquo;. Try fewer or different words.</p>
          ) : (
            results.map((r) => (
              <Link key={r.slug} href={`/docs/${r.slug}`} className="group flex items-start gap-3 border-b border-ink/8 px-4 py-3 last:border-0 hover:bg-evergreen/5">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-evergreen">{r.section}</div>
                  <div className="font-semibold text-evergreen-deep">{r.title}</div>
                  <div className="truncate text-sm text-ink-muted">{r.summary}</div>
                </div>
                <ArrowRight className="mt-5 size-4 shrink-0 text-ink-faint group-hover:text-evergreen" />
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
