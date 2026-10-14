"use client";

import { useState } from "react";
import { Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickerOption = { value: string; label: string; hint?: string };

/**
 * Pick several people (or anything) from a list, with search. Selected ones show
 * as chips on top; every selected value is submitted as its own hidden input
 * under `name`, so it works inside a plain <form action={...}>. Pass `onChange`
 * to use it outside a form.
 */
export function MultiPicker({
  name, options, defaultValue = [], onChange, placeholder = "Search…", emptyLabel = "Nobody selected",
}: {
  name?: string;
  options: PickerOption[];
  defaultValue?: string[];
  onChange?: (values: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);
  const [query, setQuery] = useState("");

  const label = new Map(options.map((o) => [o.value, o.label]));
  const q = query.trim().toLowerCase();
  const shown = (q ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)) : options).slice(0, 80);

  function toggle(v: string) {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    setSelected(next);
    onChange?.(next);
  }

  return (
    <div className="rounded-xl border border-line bg-surface">
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
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          placeholder={placeholder}
          className="h-10 w-full bg-transparent pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
      <ul className="max-h-48 divide-y divide-line overflow-y-auto border-t border-line">
        {shown.length === 0 && <li className="px-3 py-3 text-sm text-ink-faint">No match.</li>}
        {shown.map((o) => {
          const on = selected.includes(o.value);
          return (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => toggle(o.value)}
                className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-2", on && "bg-primary/5")}
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
      </ul>
    </div>
  );
}
