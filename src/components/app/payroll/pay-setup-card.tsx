"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Landmark, Smartphone, Wallet, ShieldCheck, Plus, Trash2, Pencil, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { useFeedback } from "@/components/ui/feedback";
import { savePayProfile, savePayItem, deletePayItem, revealStaffSecret } from "@/app/actions/payroll";
import { PAYOUT_METHODS, MOMO_NETWORKS, EARNING_CODES, DEDUCTION_CODES, CLERGY_NOTE } from "@/lib/payroll/defaults";
import { maskId, maskLabel } from "@/lib/payroll/mask";
import { BusyButton } from "./busy-button";
import { ghs, field } from "./ui";
import { cn } from "@/lib/utils";

export interface PayProfileView {
  basicSalary: number; ssnitApplies: boolean; tier2Applies: boolean; payeApplies: boolean; isClergy: boolean; taxResident: boolean;
  ssnitNoLast4: string | null; tinLast4: string | null; ghanaCardLast4: string | null; payoutMethod: string; bankName: string | null; bankBranch: string | null;
  accountName: string | null; accountNoLast4: string | null; momoNetwork: string | null; momoNoLast4: string | null;
}
export interface PayItemView { id: string; kind: string; code: string; label: string; amount: number; taxable: boolean; ssnitable: boolean; preTax: boolean; remitted: boolean; fromPeriod: string | null; toPeriod: string | null }

/** A masked number with a Show button. Showing is logged, and the number hides itself again after 30 seconds. */
export function SensitiveField({ staffId, field: f, label, masked, kind }: { staffId: string; field: string; label: string; masked: string | null; kind: "ghanaCard" | "ssnit" | "tin" | "account" | "momo" }) {
  const [value, setValue] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useFeedback();
  useEffect(() => {
    if (!value) return;
    const t = setTimeout(() => setValue(null), 30_000);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-xs text-ink-faint">{label}</div>
        <div className="font-mono text-sm tabular-nums" data-no-mask>{value ?? maskId(kind, masked)}</div>
      </div>
      {masked && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => {
          if (value) { setValue(null); return; }
          start(async () => {
            const r = await revealStaffSecret(staffId, f);
            if (r.ok) setValue(r.value); else toast(r.error, "error");
          });
        }}>
          {pending ? <><Spinner size="sm" /> Showing…</> : value ? <><EyeOff className="size-4" /> Hide</> : <><Eye className="size-4" /> Show</>}
        </Button>
      )}
    </div>
  );
}

function Toggle({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: string; defaultChecked: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 hover:bg-surface-2/40">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
      <span><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-xs text-ink-muted">{hint}</span>}</span>
    </label>
  );
}

export function PaySetupCard({ staffId, pay, items, canManage, statutory }: { staffId: string; pay: PayProfileView | null; items: PayItemView[]; canManage: boolean; statutory: boolean }) {
  const [editing, setEditing] = useState(false);
  const [itemFor, setItemFor] = useState<PayItemView | "earning" | "deduction" | null>(null);
  const earnings = items.filter((i) => i.kind === "earning");
  const deductions = items.filter((i) => i.kind === "deduction");
  const payout = pay ? maskLabel(pay.payoutMethod, { network: pay.momoNetwork, bankName: pay.bankName, last4: pay.payoutMethod === "momo" ? pay.momoNoLast4 : pay.accountNoLast4 }) : "Not set";
  const PayoutIcon = pay?.payoutMethod === "momo" ? Smartphone : pay?.payoutMethod === "bank" ? Landmark : Wallet;

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-gradient-to-br from-primary/[0.07] to-transparent p-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><ShieldCheck className="size-3.5" /> Pay setup, private</div>
          <div className="mt-1 font-display text-3xl font-bold tabular-nums">{pay ? ghs(pay.basicSalary) : "Not set"}</div>
          <div className="text-sm text-ink-muted">Basic salary each month</div>
        </div>
        {canManage && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}><Pencil className="size-4" /> {pay ? "Edit pay setup" : "Set up pay"}</Button>}
      </div>

      <div className="grid gap-5 p-5 md:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Statutory</div>
          {statutory ? (
            <ul className="space-y-1.5 text-sm">
              {[["SSNIT", pay?.ssnitApplies ?? true], ["Tier 2 (private trustee)", pay?.tier2Applies ?? true], ["PAYE income tax", pay?.payeApplies ?? true]].map(([l, on]) => (
                <li key={String(l)} className="flex items-center justify-between"><span>{l}</span><span className={cn("text-xs font-semibold", on ? "text-emerald-600 dark:text-emerald-400" : "text-ink-faint")}>{on ? "Applies" : "Off"}</span></li>
              ))}
              {pay?.isClergy && <li className="text-xs text-ink-muted">Minister of religion</li>}
              {pay && !pay.taxResident && <li className="text-xs text-ink-muted">Non-resident for tax</li>}
            </ul>
          ) : <p className="text-sm text-ink-muted">No SSNIT or PAYE: your church is set to no statutory deductions.</p>}
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">IDs and payout</div>
          <div className="divide-y divide-line-soft">
            <SensitiveField staffId={staffId} field="ghanaCard" label="Ghana Card" masked={pay?.ghanaCardLast4 ?? null} kind="ghanaCard" />
            <SensitiveField staffId={staffId} field="ssnitNo" label="SSNIT number" masked={pay?.ssnitNoLast4 ?? null} kind="ssnit" />
            <SensitiveField staffId={staffId} field="tin" label="TIN" masked={pay?.tinLast4 ?? null} kind="tin" />
            <div className="flex items-center gap-2 py-2.5 text-sm"><PayoutIcon className="size-4 text-primary" /><span className="text-ink-faint">Paid to</span><span className="font-medium">{payout}</span></div>
            {pay?.payoutMethod === "bank" && pay.accountNoLast4 && <SensitiveField staffId={staffId} field="accountNo" label="Account number" masked={pay.accountNoLast4} kind="account" />}
            {pay?.payoutMethod === "momo" && pay.momoNoLast4 && <SensitiveField staffId={staffId} field="momoNo" label="MoMo number" masked={pay.momoNoLast4} kind="momo" />}
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">Every Show is recorded in the payroll activity.</p>
        </div>
      </div>

      <div className="grid gap-5 border-t border-line p-5 md:grid-cols-2">
        {([["Allowances", earnings, "earning"], ["Deductions", deductions, "deduction"]] as const).map(([title, list, kind]) => (
          <div key={kind}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{title} each month</span>
              {canManage && <Button size="sm" variant="ghost" onClick={() => setItemFor(kind)}><Plus className="size-4" /> Add</Button>}
            </div>
            {list.length === 0 ? <p className="text-sm text-ink-faint">None</p> : (
              <ul className="space-y-1">
                {list.map((i) => (
                  <li key={i.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2/50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{i.label}</div>
                      <div className="text-[11px] text-ink-faint">
                        {[i.kind === "earning" ? (i.taxable ? "Taxable" : "Not taxed") : i.preTax ? "Before tax" : "After tax", i.ssnitable && "SSNIT", i.remitted && "Paid over", (i.fromPeriod || i.toPeriod) && `${i.fromPeriod ?? "now"} to ${i.toPeriod ?? "open"}`].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{ghs(i.amount)}</span>
                    {canManage && (
                      <>
                        <button type="button" aria-label={`Edit ${i.label}`} onClick={() => setItemFor(i)} className="rounded p-1 text-ink-faint hover:text-ink"><Pencil className="size-3.5" /></button>
                        <BusyButton size="sm" variant="ghost" className="h-7 px-1.5" aria-label={`Remove ${i.label}`} pendingLabel="Removing…" confirm={`Remove ${i.label}?`} run={() => deletePayItem(i.id)}><Trash2 className="size-3.5" /></BusyButton>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {editing && <PayProfileModal staffId={staffId} pay={pay} statutory={statutory} onClose={() => setEditing(false)} />}
      {itemFor && <PayItemModal staffId={staffId} item={typeof itemFor === "string" ? null : itemFor} kind={typeof itemFor === "string" ? itemFor : (itemFor.kind as "earning" | "deduction")} onClose={() => setItemFor(null)} />}
    </Card>
  );
}

function useSave(onClose: () => void) {
  const [pending, start] = useTransition();
  const { toast } = useFeedback();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) => start(async () => {
    const r = await fn();
    if (r.ok) { toast(r.message ?? "Saved", "success"); onClose(); router.refresh(); } else toast(r.error, "error");
  });
  return { pending, run };
}

function PayProfileModal({ staffId, pay, statutory, onClose }: { staffId: string; pay: PayProfileView | null; statutory: boolean; onClose: () => void }) {
  const [method, setMethod] = useState(pay?.payoutMethod ?? "bank");
  const { pending, run } = useSave(onClose);
  const idInput = (name: string, label: string, has: string | null, placeholder: string) => (
    <div>
      <Label htmlFor={`pp-${name}`}>{label}</Label>
      <Input id={`pp-${name}`} name={name} placeholder={has ? `Saved (ending ${has}). Type to replace` : placeholder} autoComplete="off" />
      {has && <label className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted"><input type="checkbox" name={`clear_${name}`} /> Remove the saved number</label>}
    </div>
  );
  return (
    <Modal open onClose={onClose} title="Pay setup" description="Private: only people with payroll access see this." wide>
      <form action={(fd) => run(() => savePayProfile(staffId, fd))} className="space-y-5">
        <div className="max-w-xs"><Label htmlFor="pp-basic">Basic salary per month (GHS)</Label><Input id="pp-basic" name="basicSalary" inputMode="decimal" defaultValue={pay ? pay.basicSalary.toFixed(2) : ""} required /></div>
        {statutory && (
          <div>
            <div className="mb-2 grid gap-2 sm:grid-cols-2">
              <Toggle name="ssnitApplies" label="SSNIT applies" hint="5.5% from them, 13% from the church" defaultChecked={pay?.ssnitApplies ?? true} />
              <Toggle name="tier2Applies" label="Tier 2 applies" hint="5% goes to a private trustee" defaultChecked={pay?.tier2Applies ?? true} />
              <Toggle name="payeApplies" label="PAYE applies" hint="Income tax through the GRA bands" defaultChecked={pay?.payeApplies ?? true} />
              <Toggle name="isClergy" label="Minister of religion" defaultChecked={pay?.isClergy ?? false} />
              <Toggle name="nonResident" label="Non-resident for tax" hint="Uses a flat rate band set" defaultChecked={pay ? !pay.taxResident : false} />
            </div>
            <p className="flex items-start gap-1.5 text-xs text-ink-muted"><Info className="mt-0.5 size-3.5 shrink-0" />{CLERGY_NOTE}</p>
          </div>
        )}
        <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-3">
          <legend className="px-1 text-sm font-semibold">ID numbers (stored encrypted)</legend>
          {idInput("ghanaCard", "Ghana Card", pay?.ghanaCardLast4 ?? null, "GHA-123456789-0")}
          {idInput("ssnitNo", "SSNIT number", pay?.ssnitNoLast4 ?? null, "e.g. C123456789012")}
          {idInput("tin", "TIN", pay?.tinLast4 ?? null, "e.g. P0012345678")}
        </fieldset>
        <fieldset className="space-y-4 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold">How they are paid</legend>
          <div role="radiogroup" className="inline-flex flex-wrap gap-0.5 rounded-xl border border-line bg-surface-2 p-1 text-sm">
            {PAYOUT_METHODS.map((m) => (
              <button key={m.value} type="button" role="radio" aria-checked={method === m.value} onClick={() => setMethod(m.value)} className={cn("rounded-lg px-3 py-1.5 font-medium", method === m.value ? "bg-primary text-white shadow-sm" : "text-ink-muted hover:text-ink")}>{m.label}</button>
            ))}
          </div>
          <input type="hidden" name="payoutMethod" value={method} />
          {method === "bank" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="pp-bank">Bank</Label><Input id="pp-bank" name="bankName" defaultValue={pay?.bankName ?? ""} placeholder="e.g. GCB" /></div>
              <div><Label htmlFor="pp-branch">Branch</Label><Input id="pp-branch" name="bankBranch" defaultValue={pay?.bankBranch ?? ""} /></div>
              <div><Label htmlFor="pp-aname">Account name</Label><Input id="pp-aname" name="accountName" defaultValue={pay?.accountName ?? ""} /></div>
              {idInput("accountNo", "Account number", pay?.accountNoLast4 ?? null, "Account number")}
            </div>
          )}
          {method === "momo" && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="pp-net">Network</Label>
                <select id="pp-net" name="momoNetwork" defaultValue={pay?.momoNetwork ?? "MTN"} className={field}>{MOMO_NETWORKS.map((n) => <option key={n}>{n}</option>)}</select>
              </div>
              <div><Label htmlFor="pp-mname">Name on the wallet</Label><Input id="pp-mname" name="accountName" defaultValue={pay?.accountName ?? ""} /></div>
              {idInput("momoNo", "MoMo number", pay?.momoNoLast4 ?? null, "024 123 4567")}
            </div>
          )}
        </fieldset>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={pending}>{pending ? <><Spinner size="sm" /> Saving…</> : "Save pay setup"}</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}

function PayItemModal({ staffId, item, kind, onClose }: { staffId: string; item: PayItemView | null; kind: "earning" | "deduction"; onClose: () => void }) {
  const codes = kind === "earning" ? EARNING_CODES : DEDUCTION_CODES;
  const [code, setCode] = useState(item?.code ?? codes[0].code);
  const preset = codes.find((c) => c.code === code);
  const { pending, run } = useSave(onClose);
  return (
    <Modal open onClose={onClose} title={item ? `Edit ${item.label}` : kind === "earning" ? "Add an allowance" : "Add a deduction"}>
      <form action={(fd) => run(() => savePayItem(staffId, fd))} className="space-y-4" key={code}>
        {item && <input type="hidden" name="id" value={item.id} />}
        <input type="hidden" name="kind" value={kind} />
        <div>
          <Label htmlFor="pi-code">Type</Label>
          <select id="pi-code" name="code" value={code} onChange={(e) => setCode(e.target.value)} className={field}>{codes.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="pi-label">Name on the payslip</Label><Input id="pi-label" name="label" defaultValue={item?.label ?? preset?.label ?? ""} /></div>
          <div><Label htmlFor="pi-amount">Amount per month (GHS)</Label><Input id="pi-amount" name="amount" inputMode="decimal" defaultValue={item ? item.amount.toFixed(2) : ""} required /></div>
          <div><Label htmlFor="pi-from">From month</Label><Input id="pi-from" name="fromPeriod" type="month" defaultValue={item?.fromPeriod ?? ""} /></div>
          <div><Label htmlFor="pi-to">Until month</Label><Input id="pi-to" name="toPeriod" type="month" defaultValue={item?.toPeriod ?? ""} /></div>
        </div>
        {kind === "earning" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle name="taxable" label="Taxable" hint="Counts for PAYE" defaultChecked={item?.taxable ?? (preset as { taxable?: boolean })?.taxable ?? true} />
            <Toggle name="ssnitable" label="Counts for SSNIT" hint="Usually basic salary only" defaultChecked={item?.ssnitable ?? false} />
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle name="preTax" label="Taken before tax" hint="e.g. Tier 3 pension" defaultChecked={item?.preTax ?? (preset as { preTax?: boolean })?.preTax ?? false} />
            <Toggle name="remitted" label="Paid over to someone" hint="Shows in To pay over after pay day" defaultChecked={item?.remitted ?? (preset as { remitted?: boolean })?.remitted ?? false} />
          </div>
        )}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={pending}>{pending ? <><Spinner size="sm" /> Saving…</> : "Save"}</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
