"use client";

import { useEffect, useRef, useState } from "react";
import { ListPager } from "@/components/ui/list-pager";
import { Spinner } from "@/components/ui/spinner";

/** One page of rows. `extra` carries anything else the screen shows that depends on the search (counts, totals). */
export type ServerPage<R, X = undefined> = { rows: R[]; total: number; page: number; extra?: X };

/**
 * A list whose searching, filtering and paging are answered by the server.
 *
 * - `query` (what is typed) is waited on for 300ms after the last key, then sent.
 * - `filters` (anything else that narrows the list: a tab, a status, a month...) go out straight away.
 * - Any change to either goes back to page 1; the pager asks for the page you click.
 * - A late answer to an old search is ignored, so fast typing never shows stale rows.
 * - `initial` is the first page the server already rendered, so nothing is fetched on first paint.
 * - When `initial.rows` is a new array (the page was refreshed after a save) the current page is fetched again.
 *
 * `fetchPage` must be a server action: (search, filters, page) => { rows, total, page }.
 */
export function useServerList<R, F, X = undefined>({
  initial, query, filters, fetchPage, pageSize = 25,
}: {
  initial: ServerPage<R, X>;
  query: string;
  filters: F;
  fetchPage: (search: string, filters: F, page: number) => Promise<ServerPage<R, X>>;
  pageSize?: number;
}) {
  const [rows, setRows] = useState<R[]>(initial.rows);
  const [total, setTotal] = useState(initial.total);
  const [extra, setExtra] = useState<X | undefined>(initial.extra);
  const [page, setPage] = useState(initial.page);
  const [searching, setSearching] = useState(false);
  const [debounced, setDebounced] = useState(query.trim());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const filterKey = JSON.stringify(filters);
  const reqId = useRef(0);
  const mounted = useRef(false);
  const latest = useRef({ debounced, filters, fetchPage, page });
  latest.current = { debounced, filters, fetchPage, page };

  function run(p: number) {
    const id = ++reqId.current;
    const cur = latest.current;
    setSearching(true);
    cur.fetchPage(cur.debounced, cur.filters, p)
      .then((res) => {
        if (id !== reqId.current) return;
        setRows(res.rows);
        setTotal(res.total);
        setExtra(res.extra);
        setPage(res.page);
      })
      .catch(() => {})
      .finally(() => { if (id === reqId.current) setSearching(false); });
  }

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    run(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, filterKey]);

  const seen = useRef(initial.rows);
  useEffect(() => {
    if (seen.current === initial.rows) return;
    seen.current = initial.rows;
    run(latest.current.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.rows]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  return {
    rows,
    extra,
    total,
    page,
    searching,
    pager: total > pageSize ? <ListPager page={page} pages={pages} total={total} size={pageSize} onPage={run} /> : null,
    /** Put this inside the (relatively positioned) search box. */
    spinner: searching ? <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" /> : null,
  };
}
