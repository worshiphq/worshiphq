"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const LIST_PAGE_SIZE = 25;

/** The page numbers to show: always the first and last, and two either side of the current one, with gaps as null. */
function window(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((n) => n >= 1 && n <= pages));
  const out: (number | null)[] = [];
  let prev = 0;
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - prev > 1) out.push(null);
    out.push(n);
    prev = n;
  }
  return out;
}

/**
 * Shows a long list a page at a time, in the browser. `resetKey` sends it back to page 1 when the search or filters
 * change. Draw `slice`, then put `pager` underneath. Nothing is drawn for a list that fits on one page.
 */
export function usePagedList<T>(items: T[], size = LIST_PAGE_SIZE, resetKey: unknown = "") {
  const [requested, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(requested, pages);
  const slice = items.slice((page - 1) * size, page * size);
  const pager = pages <= 1 ? null : <ListPager page={page} pages={pages} total={items.length} size={size} onPage={setPage} />;
  return { slice, page, pager };
}

export function ListPager({ page, pages, total, size, onPage }: { page: number; pages: number; total: number; size: number; onPage: (p: number) => void }) {
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const base = "inline-flex min-w-9 items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm transition-colors";
  return (
    <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
      <span>Showing {from.toLocaleString()} to {to.toLocaleString()} of {total.toLocaleString()}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={cn(base, "border-line", page > 1 ? "hover:bg-surface-2" : "cursor-default opacity-40")}><ChevronLeft className="size-4" /> Prev</button>
        {window(page, pages).map((p, i) =>
          p === null ? <span key={`g${i}`} className="px-1 text-ink-faint">...</span>
            : <button type="button" key={p} aria-current={p === page ? "page" : undefined} onClick={() => onPage(p)} className={cn(base, p === page ? "border-primary/50 bg-primary/10 font-semibold text-primary-bright" : "border-line hover:bg-surface-2")}>{p}</button>)}
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={cn(base, "border-line", page < pages ? "hover:bg-surface-2" : "cursor-default opacity-40")}>Next <ChevronRight className="size-4" /></button>
      </div>
    </nav>
  );
}
