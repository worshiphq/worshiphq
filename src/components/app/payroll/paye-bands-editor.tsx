"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Calculator, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { savePayeBandSet, deletePayeBandSet, addDefaultBandSet } from "@/app/actions/payroll";
import { bandBreakdown, bandTax, toP, type Band } from "@/lib/payroll/calc";
import { GHANA_PAYE_BANDS_2024, GHANA_PAYE_BANDS_NAME, ACCOUNTANT_NOTE } from "@/lib/payroll/defaults";
import { BusyButton } from "./busy-button";
import { ghs, fmtDay } from "./ui";

export interface BandSetView { id: string; name: string; effectiveFrom: string; bands: Band[]; note: string | null }

/** Rows of "Next GHS [width] at [rate]%", with a "Try an amount" calculator. */
export function PayeBandsEditor({ sets, canManage }: { sets: BandSetView[]; canManage: boolean }) {
  const [editing, setEditing] = useState<BandSetView | null>(null);
  const shown = sets.length ? sets : [{ id: "", name: `${GHANA_PAYE_BANDS_NAME} (built in)`, effectiveFrom: "2024-01-01", bands: GHANA_PAYE_BANDS_2024, note: null }];
  return (
    <Card id="bands" className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">PAYE bands (monthly)</h3>
          <p className="text-sm text-ink-muted">Each payroll uses the bands in force on the 1st of its month, and keeps them even if you change them later. {ACCOUNTANT_NOTE}</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            {!sets.length && <BusyButton size="sm" variant="secondary" pendingLabel="Adding…" run={() => addDefaultBandSet()}>Make the built-in bands editable</BusyButton>}
            <Button size="sm" onClick={() => setEditing({ id: "", name: "", effectiveFrom: new Date().toISOString().slice(0, 10), bands: (sets[0]?.bands ?? GHANA_PAYE_BANDS_2024).map((b) => ({ ...b })), note: null })}><Plus className="size-4" /> New band set</Button>
          </div>
        )}
      </div>
      <div className="mt-4 space-y-4">
        {shown.map((s) => (
          <div key={s.id || "builtin"} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><div className="font-semibold">{s.name}</div><div className="text-xs text-ink-muted">From {fmtDay(s.effectiveFrom)}</div></div>
              {canManage && s.id && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...s, bands: s.bands.map((b) => ({ ...b })) })}><Pencil className="size-4" /> Edit</Button>
                  <BusyButton size="sm" variant="ghost" className="text-danger" pendingLabel="Deleting…" confirm={`Delete ${s.name}?`} run={() => deletePayeBandSet(s.id)}><Trash2 className="size-4" /></BusyButton>
                </div>
              )}
            </div>
            <BandTable bands={s.bands} />
          </div>
        ))}
      </div>
      <TryAmount bands={(sets[0] ?? shown[0]).bands} />
      {editing && <BandSetForm initial={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function BandTable({ bands }: { bands: Band[] }) {
  const starts = bands.map((_, i) => bands.slice(0, i).reduce((t, b) => t + (b.width ?? 0), 0));
  return (
    <table className="mt-3 w-full text-sm">
      <tbody>
        {bands.map((b, i) => {
          const from = starts[i];
          return (
            <tr key={i} className="border-t border-line-soft">
              <td className="py-1.5 text-ink-muted">{b.width === null ? `Above GHS ${from.toLocaleString("en-GH", { maximumFractionDigits: 2 })}` : `${i === 0 ? "First" : "Next"} GHS ${b.width.toLocaleString("en-GH", { maximumFractionDigits: 2 })}`}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums">{b.pct}%</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TryAmount({ bands }: { bands: Band[] }) {
  const [amount, setAmount] = useState("3635");
  const p = toP(amount);
  const rows = useMemo(() => bandBreakdown(p, bands), [p, bands]);
  return (
    <div className="mt-5 rounded-xl bg-surface-2/50 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48"><Label htmlFor="ta-a"><Calculator className="mr-1 inline size-4" />Try a taxable amount</Label><Input id="ta-a" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="pb-2 text-sm">Tax: <strong className="tabular-nums">{ghs(bandTax(p, bands) / 100)}</strong></div>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-ink-muted">
        {rows.filter((r) => r.sliceP > 0).map((r, i) => <li key={i} className="flex justify-between"><span>{ghs(r.sliceP / 100)} at {r.pct}%</span><span className="tabular-nums">{ghs(r.taxP / 100)}</span></li>)}
      </ul>
    </div>
  );
}

function BandSetForm({ initial, onClose }: { initial: BandSetView; onClose: () => void }) {
  const [name, setName] = useState(initial.name);
  const [from, setFrom] = useState(initial.effectiveFrom.slice(0, 10));
  const [bands, setBands] = useState<{ width: string; pct: string }[]>(initial.bands.map((b) => ({ width: b.width === null ? "" : String(b.width), pct: String(b.pct) })));
  const set = (i: number, k: "width" | "pct", v: string) => setBands((x) => x.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  const parsed = bands.map((b, i) => ({ width: i === bands.length - 1 ? null : Number(b.width), pct: Number(b.pct) }));
  return (
    <div className="mt-5 space-y-4 rounded-xl border border-primary/30 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="bs-n">Name</Label><Input id="bs-n" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GRA bands 2027" /></div>
        <div><Label htmlFor="bs-f">In force from</Label><Input id="bs-f" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      </div>
      <div className="space-y-2">
        {bands.map((b, i) => {
          const last = i === bands.length - 1;
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-12 text-ink-muted">{last ? "Above" : i === 0 ? "First" : "Next"}</span>
              {!last ? <><span>GHS</span><Input aria-label={`Band ${i + 1} width`} className="w-32" inputMode="decimal" value={b.width} onChange={(e) => set(i, "width", e.target.value)} /></> : <span className="w-[10.5rem] text-ink-faint">the rest</span>}
              <span>at</span><Input aria-label={`Band ${i + 1} rate`} className="w-20" inputMode="decimal" value={b.pct} onChange={(e) => set(i, "pct", e.target.value)} /><span>%</span>
              {bands.length > 1 && <button type="button" aria-label="Remove band" onClick={() => setBands((x) => x.filter((_, j) => j !== i))} className="rounded p-1 text-ink-faint hover:text-danger"><Trash2 className="size-4" /></button>}
            </div>
          );
        })}
        <Button size="sm" variant="ghost" onClick={() => setBands((x) => [...x.slice(0, -1), { width: "1000", pct: "0" }, x[x.length - 1]])}><Plus className="size-4" /> Add a band</Button>
      </div>
      <div className="flex gap-2">
        <BusyButton pendingLabel="Saving bands…" run={() => savePayeBandSet({ id: initial.id || undefined, name, effectiveFrom: from, bands: parsed })} onDone={(r) => r.ok && onClose()}>Save band set</BusyButton>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
