"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

import { matchesPerson } from "@/lib/search";
export type PickerOption = { value: string; label: string; hint?: string };

/**
 * Pick several people (or anything) from a list, with search. Selected ones show
 * as chips on top; every selected value is submitted as its own hidden input
 * under `name`, so it works inside a plain <form action={...}>. Pass `onChange`
 * to use it outside a form.
 * Keyboard: type to search, Down arrow into the list, Up/Down/Home/End to move, Space or Enter to tick, Escape back to the search.
 */
export function MultiPicker({
  name, options, defaultValue = [], onChange, placeholder = "Search…", emptyLabel = "Nobody selected", search, pageSize = 20,
}: {
  name?: string;
  options: PickerOption[];
  defaultValue?: string[];
  onChange?: (values: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
  /** Ask the server for matches instead of filtering `options` (use for people). Called after a short pause, and once on load.
   *  `skip` is how many are already showing: when a search returns a full page, "Load more" asks for the next one. */
  search?: (query: string, skip: number) => Promise<PickerOption[]>;
  /** How many the server returns per page (a full page means there may be more). */
  pageSize?: number;
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionButtons = () => [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-option]") ?? [])];

  function onListKey(e: React.KeyboardEvent<HTMLUListElement>) {
    const items = optionButtons();
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    let to = -1;
    if (e.key === "ArrowDown") to = Math.min(at + 1, items.length - 1);
    else if (e.key === "ArrowUp") { if (at <= 0) { e.preventDefault(); inputRef.current?.focus(); return; } to = at - 1; }
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = items.length - 1;
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); inputRef.current?.focus(); return; }
    if (to < 0) return;
    e.preventDefault();
    items[to]?.focus();
  }

  // Server-backed: results for what is typed. Names already seen are remembered so chips keep their label.
  const [remote, setRemote] = useState<PickerOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const seen = useRef(new Map<string, string>());
  for (const o of options) seen.current.set(o.value, o.label);
  if (remote) for (const o of remote) seen.current.set(o.value, o.label);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const reqId = useRef(0);
  useEffect(() => {
    if (!search) return;
    const id = ++reqId.current;
    setLoading(true);
    setLoadingMore(false);
    const t = setTimeout(() => {
      search(query.trim(), 0)
        .then((res) => { if (id === reqId.current) { setRemote(res); setMore(res.length >= pageSize); } })
        .catch(() => { if (id === reqId.current) { setRemote([]); setMore(false); } })
        .finally(() => { if (id === reqId.current) setLoading(false); });
    }, query ? 200 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function loadMore() {
    if (!search || !remote || loadingMore) return;
    const id = reqId.current;
    setLoadingMore(true);
    search(query.trim(), remote.length)
      .then((res) => {
        if (id !== reqId.current) return;
        const have = new Set(remote.map((o) => o.value));
        setRemote([...remote, ...res.filter((o) => !have.has(o.value))]);
        setMore(res.length >= pageSize);
      })
      .catch(() => { if (id === reqId.current) setMore(false); })
      .finally(() => { if (id === reqId.current) setLoadingMore(false); });
  }

  const label = search ? seen.current : new Map(options.map((o) => [o.value, o.label]));
  const q = query.trim().toLowerCase();
  // While the server is still looking, narrow what is already on screen at once, so typing never feels stuck.
  const shown = search
    ? (loading && q ? (remote ?? []).filter((o) => matchesPerson(q, { name: o.label, text: o.hint })) : (remote ?? []))
    : (q ? options.filter((o) => matchesPerson(q, { name: o.label, text: o.hint })) : options).slice(0, 80);

  function toggle(v: string) {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    setSelected(next);
    onChange?.(next);
  }

  return (
    <div className="rounded-xl border border-line bg-surface focus-within:ring-2 focus-within:ring-primary/30">
      {name && selected.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 border-b border-line px-2.5 py-2">
        {selected.length === 0 ? (
          <span className="text-sm text-ink-faint">{emptyLabel}</span>
        ) : (
          selected.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary">
              {label.get(v) ?? "Unknown"}
              <button type="button" onClick={() => toggle(v)} className="rounded-full p-0.5 hover:bg-primary/20" aria-label={`Remove ${label.get(v) ?? ""}`}>
                <X className="size-3" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          ref={inputRef}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
            if (e.key === "ArrowDown") { e.preventDefault(); optionButtons()[0]?.focus(); }
          }}
          aria-label={placeholder}
          placeholder={placeholder}
          className="h-10 w-full bg-transparent pl-9 pr-9 text-sm text-ink outline-none placeholder:text-ink-faint"
        />
        {search && loading && <Loader2 aria-label="Searching" className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary" />}
      </div>
      <ul ref={listRef} role="listbox" aria-multiselectable aria-label={placeholder} onKeyDown={onListKey} className="max-h-72 divide-y divide-line overflow-y-auto border-t border-line">
        {loading && shown.length === 0 && <li className="flex items-center gap-2 px-3 py-3 text-sm text-ink-faint"><Loader2 className="size-4 animate-spin" /> Searching…</li>}
        {!loading && shown.length === 0 && <li className="px-3 py-3 text-sm text-ink-faint">No match.</li>}
        {shown.map((o) => {
          const on = selected.includes(o.value);
          return (
            <li key={o.value} role="presentation">
              <button
                type="button"
                data-option
                role="option"
                aria-selected={on}
                tabIndex={-1}
                onClick={() => toggle(o.value)}
                className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-2 focus:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40", on && "bg-primary/5")}
              >
                <span className={cn("grid size-4 shrink-0 place-items-center rounded border", on ? "border-primary bg-primary text-white" : "border-line")}>
                  {on && <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && <span className="shrink-0 text-xs text-ink-faint">{o.hint}</span>}
              </button>
            </li>
          );
        })}
        {search && more && !loading && shown.length > 0 && (
          <li role="presentation" className="p-2">
            <button type="button" onClick={loadMore} disabled={loadingMore} className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-70">
              {loadingMore ? <><Loader2 className="size-4 animate-spin" /> Loading…</> : "Load more"}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
