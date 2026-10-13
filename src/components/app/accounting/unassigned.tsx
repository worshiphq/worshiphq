"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { loadUnassignedEntries } from "@/app/actions/accounting";
import { formatCurrency } from "@/config/brand";
import { cn, formatDate } from "@/lib/utils";
import type { LedgerRow } from "@/lib/data/ledger";
import { MoveAccountControl } from "./entries";

/** Money recorded without a bank account, so each entry can be assigned to one. */
export function UnassignedModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [loading, start] = useTransition();
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const router = useRouter();

  useEffect(() => {
    start(async () => {
      const res = await loadUnassignedEntries();
      setRows(res.ok ? (res.rows as unknown as LedgerRow[]) : []);
    });
  }, []);

  const visible = (rows ?? []).filter((r) => !assigned.has(r.id));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <Card className="flex max-h-[85vh] w-full max-w-lg flex-col p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line p-5">
          <div>
            <h3 className="font-display text-lg font-semibold">Assign to an account</h3>
            <p className="text-sm text-ink-muted">Money recorded without a bank account. Pick where each belongs.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2"><X className="size-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {loading && rows === null ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-ink-muted">
              <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /> Loading…
            </div>
          ) : visible.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-muted">Everything is assigned to an account.</div>
          ) : (
            <div className="space-y-2">
              {visible.slice(0, 200).map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.description}</div>
                    <div className="text-xs text-ink-faint">{formatDate(r.date)} · {r.category}</div>
                  </div>
                  <span className={cn("shrink-0 whitespace-nowrap text-sm font-semibold", r.amount >= 0 ? "text-success" : "text-danger")}>
                    {r.amount >= 0 ? "+" : "−"}{formatCurrency(Math.abs(r.amount))}
                  </span>
                  <MoveAccountControl row={r} onMoved={() => { setAssigned((prev) => new Set(prev).add(r.id)); router.refresh(); }} />
                </div>
              ))}
              {visible.length > 200 && <p className="py-2 text-center text-xs text-ink-faint">Showing 200 of {visible.length}. Assign these, then reopen for the rest.</p>}
            </div>
          )}
        </div>
        <div className="flex justify-end border-t border-line p-4">
          <Button size="sm" variant="secondary" onClick={onClose}>Done</Button>
        </div>
      </Card>
    </div>
  );
}
