"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type FormCategory = { id: string; name: string; allowMultiple: boolean; options: { id: string; name: string }[] };

/**
 * Zone / fellowship / etc. pickers for the add and edit member form. One-only
 * categories are a dropdown; several-allowed ones are tappable chips. Field
 * names match lib/members/categories.ts (cat_<id> plus a form marker).
 */
export function MemberCategoryFields({ categories, selected = [] }: { categories: FormCategory[]; selected?: string[] }) {
  const [picked, setPicked] = useState<string[]>(selected);
  const usable = categories.filter((c) => c.options.length > 0);
  if (usable.length === 0) return null;

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const setSingle = (cat: FormCategory, id: string) =>
    setPicked((p) => [...p.filter((x) => !cat.options.some((o) => o.id === x)), ...(id ? [id] : [])]);
  const select =
    "flex h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";

  return (
    <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
      <input type="hidden" name="categoriesForm" value="1" />
      {usable.map((c) => {
        const mine = c.options.filter((o) => picked.includes(o.id));
        return (
          <div key={c.id} className={c.allowMultiple ? "sm:col-span-2" : undefined}>
            <label className="mb-1.5 block text-sm font-medium text-ink-muted" htmlFor={`cat-${c.id}`}>
              {c.name}
            </label>
            {c.allowMultiple ? (
              <div className="flex flex-wrap gap-2">
                {mine.map((o) => <input key={o.id} type="hidden" name={`cat_${c.id}`} value={o.id} />)}
                {c.options.map((o) => {
                  const on = picked.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggle(o.id)}
                      aria-pressed={on}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                        on ? "border-primary bg-primary/10 text-primary-bright" : "border-line text-ink-muted hover:bg-surface-2",
                      )}
                    >
                      {o.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <select id={`cat-${c.id}`} name={`cat_${c.id}`} value={mine[0]?.id ?? ""} onChange={(e) => setSingle(c, e.target.value)} className={select}>
                <option value="">Not set</option>
                {c.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}
