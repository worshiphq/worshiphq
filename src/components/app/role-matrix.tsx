"use client";

import { useState } from "react";
import { SECTION_GROUPS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * View / Manage permission grid for a custom role.
 *
 * Rules: Manage implies View (you can't edit what you can't open), so ticking
 * Manage ticks View, and un-ticking View drops Manage too. Ticking View alone
 * never grants Manage. Emits hidden inputs so it works inside a plain form.
 */
export function RoleMatrix({
  initialView = [],
  initialManage = [],
  idPrefix = "role",
}: {
  initialView?: string[];
  initialManage?: string[];
  idPrefix?: string;
}) {
  const [view, setView] = useState<Set<string>>(new Set(initialView));
  const [manage, setManage] = useState<Set<string>>(new Set(initialManage));

  function toggleView(key: string) {
    setView((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        // Losing view must also lose manage.
        setManage((m) => {
          const mm = new Set(m);
          mm.delete(key);
          return mm;
        });
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleManage(key: string) {
    setManage((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        // Managing implies viewing.
        setView((v) => new Set(v).add(key));
      }
      return next;
    });
  }

  const allKeys = SECTION_GROUPS.flatMap((g) => g.sections.map((s) => s.key));
  const clearAll = () => { setView(new Set()); setManage(new Set()); };
  const selectAllView = () => setView(new Set(allKeys));

  return (
    <div>
      {/* Hidden inputs carry the real values to the server action. */}
      {[...view].map((k) => <input key={`v-${k}`} type="hidden" name="sections" value={k} />)}
      {[...manage].map((k) => <input key={`m-${k}`} type="hidden" name="manageSections" value={k} />)}

      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-ink-faint">
          <b>View</b> = can open &amp; read. <b>Manage</b> = can also add &amp; edit (ticking it ticks View).
        </p>
        <div className="flex gap-2 text-[11px]">
          <button type="button" onClick={selectAllView} className="text-primary hover:underline">All view</button>
          <button type="button" onClick={clearAll} className="text-ink-faint hover:underline">Clear</button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pr-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
        <span className="w-12 text-center">View</span>
        <span className="w-12 text-center">Manage</span>
      </div>

      <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border border-line p-3">
        {SECTION_GROUPS.map((group) => (
          <div key={group.category}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{group.category}</div>
            <div className="divide-y divide-line-soft">
              {group.sections.map((s) => {
                const v = view.has(s.key);
                const m = manage.has(s.key);
                return (
                  <div key={s.key} className={cn("flex items-center justify-between gap-3 py-1.5", v && "font-medium")}>
                    <span className="text-sm">{s.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="w-12 text-center">
                        <input
                          type="checkbox"
                          checked={v}
                          onChange={() => toggleView(s.key)}
                          aria-label={`View ${s.label}`}
                          className="size-4 rounded border-line accent-primary"
                        />
                      </span>
                      <span className="w-12 text-center">
                        {s.manageable ? (
                          <input
                            type="checkbox"
                            checked={m}
                            onChange={() => toggleManage(s.key)}
                            aria-label={`Manage ${s.label}`}
                            className="size-4 rounded border-line accent-primary"
                          />
                        ) : (
                          <span className="text-ink-faint/40">—</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        {view.size === 0
          ? "Nothing ticked — this role would see nothing."
          : `${view.size} section${view.size !== 1 ? "s" : ""} visible, ${manage.size} manageable. They see only what's ticked.`}
      </p>
      <input type="hidden" name="_prefix" value={idPrefix} />
    </div>
  );
}
