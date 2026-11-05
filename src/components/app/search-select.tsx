"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

import { matchesPerson } from "@/lib/search";
export type SearchOption = { value: string; label: string; hint?: string; phone?: string | null };

/**
 * A select you can type into: click it, start typing a name (or phone, or
 * anything in the hint) and the list narrows. Works inside a plain
 * <form action={...}> through a hidden input named `name`, or controlled with
 * `value` + `onChange`. An option with value "" is treated as "nothing chosen".
 */
export function SearchSelect({
  name, options, value, defaultValue = "", onChange, placeholder = "Select…", searchPlaceholder = "Type to search…",
  required, className, compact, search,
}: {
  name?: string;
  options: SearchOption[];
  value?: string;
  defaultValue?: string;
  /** Called with the chosen value and the whole option (which may carry more, like a phone number). */
  onChange?: (value: string, option?: SearchOption) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  className?: string;
  /** Shorter trigger that matches 36px inputs. */
  compact?: boolean;
  /**
   * Ask the server for matches instead of filtering `options` (use for people: nothing has to be preloaded). Called after
   * a 300ms pause in typing, and once when the list opens. `options` then only needs to hold what is already chosen, so
   * its name can be shown.
   */
  search?: (query: string) => Promise<SearchOption[]>;
}) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();

  // Server-backed: results for what is typed, plus every option ever seen so a chosen name keeps showing.
  const [remote, setRemote] = useState<SearchOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const known = useRef(new Map<string, SearchOption>());
  for (const o of options) if (o.value !== "") known.current.set(o.value, o);
  if (remote) for (const o of remote) known.current.set(o.value, o);
  const reqId = useRef(0);
  useEffect(() => {
    if (!search || !open) return;
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(() => {
      search(query.trim())
        .then((res) => { if (id === reqId.current) setRemote(res); })
        .catch(() => { if (id === reqId.current) setRemote([]); })
        .finally(() => { if (id === reqId.current) setLoading(false); });
    }, query ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  const empty = options.find((o) => o.value === "");
  const real = search ? (remote ?? options.filter((o) => o.value !== "")) : options.filter((o) => o.value !== "");
  const q = query.trim().toLowerCase();
  const shown = search ? real : (q ? real.filter((o) => matchesPerson(q, { name: o.label, text: o.hint })) : real).slice(0, 100);
  const chosen = search ? known.current.get(current) : real.find((o) => o.value === current);

  function pick(v: string) {
    setInner(v);
    onChange?.(v, v === "" ? empty : (search ? known.current.get(v) : real.find((o) => o.value === v)));
    setOpen(false);
    setQuery("");
    trigger.current?.focus(); // the search box goes away with the list, so keep the keyboard on the field
  }

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "PageDown") { e.preventDefault(); setHi((h) => Math.min(h + 8, shown.length - 1)); }
    else if (e.key === "PageUp") { e.preventDefault(); setHi((h) => Math.max(h - 8, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[hi]) pick(shown[hi].value); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); setQuery(""); trigger.current?.focus(); }
    else if (e.key === "Tab") { setOpen(false); setQuery(""); }
  }

  /** On the closed field: Down or Up opens the list; Delete or Backspace clears a choice (the little x is mouse only). */
  function onTriggerKey(e: React.KeyboardEvent) {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) { e.preventDefault(); setOpen(true); setHi(0); }
    else if ((e.key === "Delete" || e.key === "Backspace") && chosen && empty) { e.preventDefault(); pick(""); }
  }

  return (
    <div ref={root} className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={current} />}
      {/* required: a visually hidden text input lets the browser block an empty submit */}
      {required && <input tabIndex={-1} aria-hidden required value={current} onChange={() => {}} className="pointer-events-none absolute inset-0 opacity-0" />}
      <button
        ref={trigger}
        type="button"
        onClick={() => { setOpen((o) => !o); setHi(0); }}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={chosen ? undefined : (empty?.label ?? placeholder)}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-left text-sm text-ink focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          compact ? "h-9 rounded-lg px-2.5" : "h-11",
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", !chosen && "text-ink-faint")}>
          {chosen ? chosen.label : empty?.label ?? placeholder}
        </span>
        {chosen && chosen.hint && !compact && <span className="shrink-0 text-xs text-ink-faint">{chosen.hint}</span>}
        {chosen && empty ? (
          <span
            aria-hidden
            title="Clear (or press Delete)"
            onClick={(e) => { e.stopPropagation(); pick(""); }}
            className="rounded p-0.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-3.5" />
          </span>
        ) : (
          <ChevronDown className="size-4 shrink-0 text-ink-faint" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
          <div className="relative border-b border-line">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <input
              ref={input}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHi(0); }}
              onKeyDown={onKey}
              placeholder={searchPlaceholder}
              role="combobox"
              aria-label={searchPlaceholder}
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={shown[hi] ? `${listId}-${hi}` : undefined}
              className="h-10 w-full bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-ink-faint"
            />
          </div>
          <ul ref={list} id={listId} role="listbox" className="max-h-60 overflow-y-auto py-1">
            {loading && shown.length === 0 && <li className="px-3.5 py-3 text-sm text-ink-faint">Searching…</li>}
            {!loading && shown.length === 0 && <li className="px-3.5 py-3 text-sm text-ink-faint">No match for “{query}”.</li>}
            {shown.map((o, i) => (
              <li key={o.value} data-i={i} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={o.value === current}
                  tabIndex={-1}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(o.value)}
                  className={cn("flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm", i === hi && "bg-surface-2", o.value === current && "font-medium text-primary")}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 text-xs text-ink-faint">{o.hint}</span>}
                  {o.value === current && <Check className="size-4 shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
