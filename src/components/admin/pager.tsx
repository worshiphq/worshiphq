"use client";

import Link from "@/components/ui/app-link";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ADMIN_PAGE_SIZE, pageWindow } from "@/lib/admin-paging";

const cell = "inline-flex min-w-9 items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm";
const idle = `${cell} border-white/10 text-slate-300 hover:bg-white/10`;
const here = `${cell} border-teal-400/50 bg-teal-500/15 font-semibold text-teal-200`;
const off = `${cell} cursor-default border-white/5 text-slate-600`;

function Summary({ page, size, total, shown }: { page: number; size: number; total: number; shown?: number }) {
  if (total === 0) return <span>Nothing to show</span>;
  const from = (page - 1) * size + 1;
  const to = Math.min(total, from + (shown ?? size) - 1);
  return <span>Showing {from.toLocaleString()} to {to.toLocaleString()} of {total.toLocaleString()}</span>;
}

/**
 * The pager for a list the SERVER pages (the URL carries ?page=). `path` is the page's own address and `params` the other
 * things in its address that must survive a page change, like a search. Hidden when everything fits on one page.
 */
export function Pager({ page, pages, total, size = ADMIN_PAGE_SIZE, path, params = {}, pageParam = "page" }: {
  page: number; pages: number; total: number; size?: number; path: string; params?: Record<string, string | undefined>;
  /** The address part that holds this list's page. Give each list on one page its own. */
  pageParam?: string;
}) {
  if (pages <= 1) return total > 0 ? <p className="mt-3 text-xs text-slate-500"><Summary page={1} size={size} total={total} /></p> : null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set(pageParam, String(p));
    const qs = sp.toString();
    return qs ? `${path}?${qs}` : path;
  };
  return (
    <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
      <Summary page={page} size={size} total={total} />
      <div className="flex flex-wrap items-center gap-1.5">
        {page > 1 ? <Link href={href(page - 1)} className={idle}><ChevronLeft className="size-4" /> Prev</Link> : <span className={off}><ChevronLeft className="size-4" /> Prev</span>}
        {pageWindow(page, pages).map((p, i) =>
          p === null ? <span key={`g${i}`} className="px-1 text-slate-600">...</span>
            : p === page ? <span key={p} aria-current="page" className={here}>{p}</span>
              : <Link key={p} href={href(p)} className={idle}>{p}</Link>)}
        {page < pages ? <Link href={href(page + 1)} className={idle}>Next <ChevronRight className="size-4" /></Link> : <span className={off}>Next <ChevronRight className="size-4" /></span>}
      </div>
    </nav>
  );
}

/** The same pager for a list that is already in memory and paged by the browser. */
export function ClientPager({ page, pages, total, size = ADMIN_PAGE_SIZE, shown, onPage }: {
  page: number; pages: number; total: number; size?: number; shown?: number; onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
      <Summary page={page} size={size} total={total} shown={shown} />
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={page > 1 ? idle : off}><ChevronLeft className="size-4" /> Prev</button>
        {pageWindow(page, pages).map((p, i) =>
          p === null ? <span key={`g${i}`} className="px-1 text-slate-600">...</span>
            : <button type="button" key={p} aria-current={p === page ? "page" : undefined} onClick={() => onPage(p)} className={p === page ? here : idle}>{p}</button>)}
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={page < pages ? idle : off}>Next <ChevronRight className="size-4" /></button>
      </div>
    </nav>
  );
}

/** For a component that draws its own list: gives the rows for the current page and the pager to put underneath. */
export function usePaged<T>(items: T[], size = 10) {
  const [requested, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(requested, pages);
  const slice = items.slice((page - 1) * size, page * size);
  return {
    slice,
    page,
    pager: <ClientPager page={page} pages={pages} total={items.length} size={size} shown={slice.length} onPage={setPage} />,
  };
}

/**
 * A short list that is already in memory (a few dozen rows), shown a page at a time. Give it the items and how to draw
 * one; it keeps its own page and puts the pager underneath.
 */
export function PagedList<T>({ items, size = 10, empty, render, wrap }: {
  items: T[]; size?: number; empty?: React.ReactNode; render: (item: T, index: number) => React.ReactNode;
  wrap?: (children: React.ReactNode) => React.ReactNode;
}) {
  const [requested, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(requested, pages);
  const slice = items.slice((page - 1) * size, page * size);
  if (items.length === 0) return <>{empty ?? null}</>;
  const body = slice.map((it, i) => render(it, (page - 1) * size + i));
  return (
    <>
      {wrap ? wrap(body) : body}
      <ClientPager page={page} pages={pages} total={items.length} size={size} shown={slice.length} onPage={setPage} />
    </>
  );
}
