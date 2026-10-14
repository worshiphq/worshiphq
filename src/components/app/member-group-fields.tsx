"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Groups a member belongs to, as tappable chips, for the add and edit member form.
 * Every selected group is sent as its own `groups` value, and `groupsForm` tells
 * the server this section was on the form so an empty choice really clears them.
 */
export function MemberGroupFields({
  groups, selected = [],
}: { groups: { id: string; name: string }[]; selected?: string[] }) {
  const [picked, setPicked] = useState<string[]>(selected);
  if (groups.length === 0) return null;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div className="border-t border-line pt-4">
      <input type="hidden" name="groupsForm" value="1" />
      {picked.map((id) => <input key={id} type="hidden" name="groups" value={id} />)}
      <label className="mb-1.5 block text-sm font-medium text-ink-muted">Groups</label>
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => {
          const on = picked.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggle(g.id)}
              aria-pressed={on}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                on ? "border-primary bg-primary/10 text-primary-bright" : "border-line text-ink-muted hover:bg-surface-2",
              )}
            >
              {g.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
