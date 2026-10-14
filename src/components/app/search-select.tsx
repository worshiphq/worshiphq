"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

import { matchesPerson } from "@/lib/search";
export type SearchOption = { value: string; label: string; hint?: string };

/**
 * A select you can type into: click it, start typing a name (or phone, or
 * anything in the hint) and the list narrows. Works inside a plain
 * <form action={...}> through a hidden input named `name`, or controlled with
 * `value` + `onChange`. An option with value "" is treated as "nothing chosen".
 */
export function SearchSelect({
  name, options, value, defaultValue = "", onChange, placeholder = "Select…", searchPlaceholder = "Type to search…",
  required, className, compact,
}: {
  name?: string;
  options: SearchOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  className?: string;
  /** Shorter trigger that matches 36px inputs. */
  compact?: boolean;
}) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const empty = options.find((o) => o.value === "");
  const real = options.filter((o) => o.value !== "");
  const q = query.trim().toLowerCase();
  const shown = (q ? real.filter((o) => matchesPerson(q, { name: o.label, text: o.hint })) : real).slice(0, 100);
  const chosen = real.find((o) => o.value === current);

  function pick(v: string) {
    setInner(v);
    onChange?.(v);
    setOpen(false);
    setQuery("");
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
    else if (e.key === "Enter") { e.preventDefault(); if (shown[hi]) pick(shown[hi].value); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  }

  return (
    <div ref={root} className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={current} />}
      {/* required: a visually hidden text input lets the browser block an empty submit */}
      {required && <input tabIndex={-1} aria-hidden required value={current} onChange={() => {}} className="pointer-events-none absolute inset-0 opacity-0" />}
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setHi(0); }}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-left text-sm text-ink focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          compact ? "h-9 rounded-lg px-2.5" : "h-11",
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", !chosen && "text-ink-faint")}>
          {chosen ? chosen.label : empty?.label ?? placeholder}
        </span>
        {chosen && chosen.hint && <span className="shrink-0 text-xs text-ink-faint">{chosen.hint}</span>}
        {chosen && empty ? (
          <span
            role="button"
            aria-label="Clear"
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
              className="h-10 w-full bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-ink-faint"
            />
          </div>
          <ul ref={list} className="max-h-60 overflow-y-auto py-1">
            {shown.length === 0 && <li className="px-3.5 py-3 text-sm text-ink-faint">No match for “{query}”.</li>}
            {shown.map((o, i) => (
              <li key={o.value} data-i={i}>
                <button
                  type="button"
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
