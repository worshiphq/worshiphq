"use client";

import { Button } from "@/components/ui/button";

export const PERIODS = [
  { key: "", label: "All time" },
  { key: "today", label: "Today" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "year", label: "This year" },
] as const;

/** Start of the chosen period (null = no lower bound). */
export function periodStart(key: string): number | null {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (key === "today") return day;
  if (key === "year") return new Date(now.getFullYear(), 0, 1).getTime();
  const n = Number(key);
  return n > 0 ? day - (n - 1) * 86400000 : null;
}

export const filterSelectCls =
  "h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink-muted outline-none focus:border-primary/50";

/** Previous / Next with a "Showing a-b of n" label. */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between pt-2 text-xs text-ink-muted">
      <span>Showing {from}-{to} of {total}</span>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span className="px-1">Page {page} of {pages}</span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
