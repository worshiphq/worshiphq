"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Drop-in replacement for a native <select> when the option list is long
 * (nationality, etc.) - adds search-to-filter, full keyboard navigation
 * (arrow keys / Enter / Escape), and flips the panel above the trigger when
 * there isn't room below. Renders a hidden input so it still participates in
 * a plain <form action={...}> the same way a native select would.
 *
 * Only use this over a plain <select> when the list is long enough that
 * search actually helps (roughly 10+ options) - for short lists a native
 * select is simpler and just as fast to use.
 */
export function Combobox({
  name,
  value,
  onChange,
  options,
  placeholder = "Select…",
  required,
  className,
}: {
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [openUpward, setOpenUpward] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  // Decide whether the panel fits below the trigger; flip above if not.
  useEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const estimatedHeight = Math.min(320, filtered.length * 36 + (options.length >= 10 ? 48 : 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setOpenUpward(spaceBelow < estimatedHeight && spaceAbove > spaceBelow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlighted(Math.max(0, options.indexOf(value)));
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    setHighlighted((h) => Math.min(h, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    listRef.current?.children[highlighted]?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  function commit(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) commit(filtered[highlighted]);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-xl border border-line bg-surface px-3.5 text-sm text-left transition-colors",
          value ? "text-ink" : "text-ink-faint",
          "hover:border-primary/40",
          "focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          open && "border-primary/60 ring-2 ring-primary/30",
          className,
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-ink-faint transition-transform duration-150", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg animate-pop-in",
            openUpward ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          {options.length >= 10 && (
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Search className="size-3.5 shrink-0 text-ink-faint" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlighted(0); }}
                placeholder="Search…"
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
          )}
          <ul ref={listRef} role="listbox" className="max-h-56 overflow-y-auto overscroll-contain py-1">
            {filtered.length === 0 ? (
              <li className="px-3.5 py-2.5 text-sm text-ink-faint">No matches.</li>
            ) : (
              filtered.map((o, i) => (
                <li
                  key={o}
                  role="option"
                  aria-selected={o === value}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => commit(o)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 px-3.5 py-2 text-sm transition-colors",
                    i === highlighted ? "bg-primary/10 text-ink" : "text-ink-muted",
                  )}
                >
                  <span className="truncate">{o}</span>
                  {o === value && <Check className="size-3.5 shrink-0 text-primary" />}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
