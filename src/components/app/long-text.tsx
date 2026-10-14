"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A roomy writing box for sermons, devotionals and notes: tall to start with,
 * grows as you write, keeps the 16px readable size, and shows a word count.
 */
export function LongText({
  value, onChange, placeholder, minRows = 18, className, label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);

  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const mins = Math.max(1, Math.round(words / 130));

  return (
    <div>
      <textarea
        ref={ref}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={minRows}
        className={cn(
          "block w-full resize-y rounded-xl border border-line bg-surface px-4 py-3.5 text-[1rem] leading-7 text-ink placeholder:text-ink-faint focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          className,
        )}
      />
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-faint">
        <span>{words.toLocaleString()} word{words === 1 ? "" : "s"}{words > 0 ? ` · about ${mins} min` : ""}</span>
        <span>{value.length.toLocaleString()} characters</span>
      </div>
    </div>
  );
}
