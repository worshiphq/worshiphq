"use client";

import { cn } from "@/lib/utils";

/** A segmented tab control — a bordered track with a raised active pill and
 *  clearly separated inactive tabs. Used for mode/period switches. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex flex-wrap items-center gap-0.5 rounded-xl border border-line bg-base p-1 text-sm", className)}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <div key={String(o.value)} className="flex items-center">
            {i > 0 && !active && <span className="mr-0.5 h-4 w-px bg-line/70" aria-hidden />}
            <button
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              className={cn(
                "rounded-lg px-3 py-1.5 font-medium transition-colors",
                active ? "bg-primary text-white shadow-sm" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {o.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
