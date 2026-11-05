"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * A notice with a small X in its top corner. Closing it is remembered in this browser under `id`, so it stays closed until
 * `id` changes (a new trial, or a new day for a countdown). Shows from the start, then hides after load if it was closed.
 */
export function DismissibleNotice({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem(`whq_dismissed_${id}`)) setClosed(true); } catch { /* private window: keep it showing */ }
  }, [id]);
  if (closed) return null;
  return (
    <div className={`relative ${className ?? ""}`}>
      {children}
      <button
        type="button"
        aria-label="Close this notice"
        title="Close"
        onClick={() => { try { localStorage.setItem(`whq_dismissed_${id}`, "1"); } catch { /* ignore */ } setClosed(true); }}
        className="absolute right-2 top-2 grid size-6 place-items-center rounded-full text-current opacity-60 transition-opacity hover:bg-black/10 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
