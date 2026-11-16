"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Tick boxes with Shift ranges: click one row, hold Shift and click another, and every row between them takes the
 * first row's state (ticked or not). The anchor is kept by id, not position, so it survives re-sorting and paging.
 * `ids` is the order the rows are shown in right now.
 */
export function useRangeSelect(ids: string[]) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);

  const tick = useCallback((id: string, shift: boolean) => {
    // Work out the range here, before React runs the update: reading the anchor inside the updater
    // would see it already moved to this row, and the range would shrink to one box.
    const from = shift && anchor.current ? ids.indexOf(anchor.current) : -1;
    const to = ids.indexOf(id);
    const anchorId = anchor.current;
    setSel((prev) => {
      const next = new Set(prev);
      if (from >= 0 && to >= 0 && anchorId) {
        const on = prev.has(anchorId);
        for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
          if (on) next.add(ids[i]!); else next.delete(ids[i]!);
        }
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchor.current = id;
  }, [ids]);

  const allOn = ids.length > 0 && ids.every((id) => sel.has(id));
  const toggleAll = useCallback(() => {
    setSel((prev) => {
      const next = new Set(prev);
      const on = !ids.every((id) => prev.has(id));
      for (const id of ids) { if (on) next.add(id); else next.delete(id); }
      return next;
    });
  }, [ids]);

  const clear = useCallback(() => { setSel(new Set()); anchor.current = null; }, []);

  return { sel, setSel, tick, allOn, toggleAll, clear };
}
