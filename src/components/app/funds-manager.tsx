"use client";

import { useState, useTransition } from "react";
import { PiggyBank, Plus, Pencil, Trash2, Check, X, Loader2, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { createFund, renameFund, deleteFund, setFundRestricted } from "@/app/actions/funds";
import { useRouter } from "next/navigation";
import { confirmBinDelete } from "@/lib/recycle-bin-events";
import { BIN_TOAST } from "@/lib/recycle-bin-config";

export interface FundRow {
  id: string;
  name: string;
  color: string;
  giftCount: number;
  total: number;
  /** Max: money given to it can only be spent on it, up to its balance. */
  restricted?: boolean;
  /** Spent from this fund so far (expenses charged to it). */
  spent?: number;
}

const SWATCHES = ["#6D5EF8", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#8B5CF6", "#64748B"];

/**
 * Funds are the pots of money a church tracks (General, Building, Missions…).
 * Every gift/pledge is tagged to one. This lets admins add, rename, recolour and
 * delete them. A fund with giving recorded against it can't be deleted until
 * that giving is moved, so history is never orphaned.
 */
export function FundsManager({ funds, canWrite, fundAccounting = false }: { funds: FundRow[]; canWrite: boolean; /** The plan includes fund accounting (Max). */ fundAccounting?: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useFeedback();
  const router = useRouter();

  const submit = (fd: FormData, fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, ok: string, done: () => void) => {
    start(async () => {
      const res = await fn(fd);
      if (res.ok) { toast(ok, "success"); done(); router.refresh(); }
      else toast(res.error ?? "Something went wrong", "error");
    });
  };

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between border-b border-line p-5">
        <div className="flex items-center gap-2">
          <PiggyBank className="size-5 text-primary" />
          <div>
            <h3 className="font-display text-lg font-semibold">Funds</h3>
            <p className="text-xs text-ink-muted">Pots of money you track separately - every gift is tagged to one.</p>
          </div>
        </div>
        {canWrite && !adding && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}><Plus className="size-4" /> New fund</Button>
        )}
      </div>

      {adding && canWrite && (
        <form
          action={(fd) => submit(fd, createFund, "Fund created", () => setAdding(false))}
          className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2/40 p-4"
        >
          <input name="name" required autoFocus placeholder="Fund name (e.g. Building)"
            className="h-9 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-primary/50" />
          <ColorPicker name="color" />
          <Button size="sm" type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Add</Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
        </form>
      )}

      {funds.length === 0 && !adding ? (
        <div className="p-8 text-center text-sm text-ink-muted">No funds yet. They’re created automatically when you record giving, or add one above.</div>
      ) : (
        <div className="divide-y divide-line-soft">
          {funds.map((f) =>
            editId === f.id ? (
              <form
                key={f.id}
                action={(fd) => { fd.set("id", f.id); submit(fd, renameFund, "Fund updated", () => setEditId(null)); }}
                className="flex flex-wrap items-center gap-2 bg-primary/5 p-4"
              >
                <input name="name" required defaultValue={f.name}
                  className="h-9 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-primary/50" />
                <ColorPicker name="color" defaultValue={f.color} />
                <button type="submit" disabled={pending} className="grid size-8 place-items-center rounded-lg text-success hover:bg-success/10">
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                </button>
                <button type="button" onClick={() => setEditId(null)} className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-surface-2"><X className="size-4" /></button>
              </form>
            ) : (
              <div key={f.id} className="flex items-center gap-3 p-4">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{f.name}</div>
                  <div className="text-xs text-ink-faint">
                    {f.giftCount > 0 ? `${f.giftCount} gift${f.giftCount === 1 ? "" : "s"} · ₵${f.total.toLocaleString()}` : "No giving yet"}
                    {f.restricted && (
                      <>
                        {" · "}spent ₵{(f.spent ?? 0).toLocaleString()} ·{" "}
                        <b className={f.total - (f.spent ?? 0) <= 0 ? "text-danger" : "text-success"}>₵{(f.total - (f.spent ?? 0)).toLocaleString()} left</b>
                      </>
                    )}
                  </div>
                </div>
                {f.restricted && (
                  <span title="Money given to this fund can only be spent on it, up to its balance" className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    <Lock className="size-3" /> Restricted
                  </span>
                )}
                {fundAccounting && canWrite && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      const fd = new FormData(); fd.set("id", f.id); fd.set("restricted", String(!f.restricted));
                      submit(fd, setFundRestricted, f.restricted ? "Fund is no longer restricted" : "Fund restricted: it can only be spent up to its balance", () => {});
                    }}
                    className="rounded-lg border border-line px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-2 disabled:opacity-50"
                  >
                    {f.restricted ? "Unrestrict" : "Restrict"}
                  </button>
                )}
                {canWrite && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditId(f.id)} title="Rename / recolour"
                      className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-primary/10 hover:text-primary">
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (f.giftCount > 0) { toast(`“${f.name}” has giving recorded - move it to another fund first.`, "error"); return; }
                        if (!confirmBinDelete(`Delete the “${f.name}” fund?`)) return;
                        const fd = new FormData(); fd.set("id", f.id);
                        submit(fd, deleteFund, BIN_TOAST, () => {});
                      }}
                      title="Delete fund"
                      className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      )}
    </Card>
  );
}

function ColorPicker({ name, defaultValue = SWATCHES[0] }: { name: string; defaultValue?: string }) {
  const [color, setColor] = useState(defaultValue);
  return (
    <div className="flex items-center gap-1">
      <input type="hidden" name={name} value={color} />
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setColor(c)}
          className={`size-5 rounded-full ${color === c ? "ring-2 ring-offset-1 ring-ink/40" : ""}`}
          style={{ backgroundColor: c }}
          aria-label={`Colour ${c}`}
        />
      ))}
    </div>
  );
}
