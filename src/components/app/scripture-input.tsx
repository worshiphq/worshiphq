"use client";

import { useState } from "react";
import { BookOpen, Plus, X } from "lucide-react";

/** "John 3:16; Romans 8:28" <-> ["John 3:16", "Romans 8:28"] */
export const splitScriptures = (v: string | null | undefined) =>
  (v ?? "").split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
export const joinScriptures = (list: string[]) => list.join("; ");

/**
 * Type any number of Bible references. Press Enter (or ;) after each one and it
 * becomes a chip; remove with the x. The value is one string, references
 * separated by "; ", so it fits the existing single scripture column.
 */
export function ScriptureInput({
  value, onChange, placeholder = "e.g. John 3:16-21, then press Enter",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const list = splitScriptures(value);

  function commit(raw: string) {
    const add = splitScriptures(raw).filter((r) => !list.includes(r));
    if (add.length) onChange(joinScriptures([...list, ...add]));
    setDraft("");
  }

  return (
    <div className="rounded-xl border border-line bg-surface focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/30">
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-2">
        {list.map((r) => (
          <span key={r} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-2.5 pr-1.5 text-xs font-medium text-primary">
            <BookOpen className="size-3" /> {r}
            <button type="button" onClick={() => onChange(joinScriptures(list.filter((x) => x !== r)))} className="rounded-full p-0.5 hover:bg-primary/20" aria-label={`Remove ${r}`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(";")) commit(v); else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(draft); }
            else if (e.key === "Backspace" && !draft && list.length) onChange(joinScriptures(list.slice(0, -1)));
          }}
          onBlur={() => draft.trim() && commit(draft)}
          placeholder={list.length ? "Add another…" : placeholder}
          className="h-8 min-w-[10rem] flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        />
        {draft.trim() && (
          <button type="button" onClick={() => commit(draft)} className="inline-flex h-7 items-center gap-1 rounded-lg bg-primary/10 px-2 text-xs font-medium text-primary hover:bg-primary/20">
            <Plus className="size-3" /> Add
          </button>
        )}
      </div>
    </div>
  );
}
