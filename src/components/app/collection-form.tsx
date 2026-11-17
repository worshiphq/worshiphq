"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Banknote, Smartphone, Landmark, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { collectionAlreadyRecorded, recordCollection } from "@/app/actions/giving";
import { useServicePicker } from "@/components/app/service-picker";
import type { AccountOption } from "@/components/app/account-select";
import { COLLECTION_METHODS, type Channel } from "@/lib/giving/channels";
import { formatCurrency } from "@/config/brand";
import { cn } from "@/lib/utils";

const CHANNELS: { key: Channel; label: string; hint: string; icon: typeof Banknote }[] = [
  { key: "cash", label: "Cash", hint: "Counted notes and coins", icon: Banknote },
  { key: "momo", label: "Mobile Money", hint: "MoMo received for the offering", icon: Smartphone },
  { key: "bank", label: "Bank / card", hint: "Transfers, cheques, card", icon: Landmark },
];
const ACCOUNT_TYPE: Record<Channel, string> = { cash: "cash", momo: "mobile-money", bank: "bank" };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Sunday 16 Nov" for a YYYY-MM-DD date. */
const dayLabel = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? ymd : `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
};
const sel = "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";

/**
 * Record an offering or other collection as ONE total, split by how it was
 * received. No names: the church counts it together. Each part is banked into the
 * account you pick (defaulting to a matching cash / Mobile Money / bank account).
 */
export function CollectionForm({ fundName, funds, accounts, onDone, serviceHint, initialDate }: {
  fundName?: string;
  /** When no fund is fixed, the choices (the first is preselected). */
  funds?: string[];
  accounts: AccountOption[];
  onDone?: () => void;
  /** Preselect this service (the Service income page opens the form for one). */
  serviceHint?: string;
  /** Preselect this date (YYYY-MM-DD). */
  initialDate?: string;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [fund, setFund] = useState(fundName ?? funds?.[0] ?? "Offertory");
  const [date, setDate] = useState(initialDate ?? new Date().toISOString().slice(0, 10));
  const service = useServicePicker(date, { prefer: serviceHint ?? null, id: "col-service" });
  // Gentle double-entry guard: what is already recorded for this fund that day, shown once before saving.
  const [already, setAlready] = useState<{ key: string; total: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const fallback = accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? "";
  // Cash is often counted first and banked later, so it starts as "not banked yet" rather than in an account.
  const NOT_BANKED = "none";
  const pickAccount = (c: Channel) => (c === "cash" ? NOT_BANKED : accounts.find((a) => a.type === ACCOUNT_TYPE[c])?.id ?? fallback);

  const [amount, setAmount] = useState<Record<Channel, string>>({ cash: "", momo: "", bank: "" });
  const [method, setMethod] = useState<Record<Channel, string>>({ cash: "Cash", momo: "MTN_MoMo", bank: "Bank" });
  const [acct, setAcct] = useState<Record<Channel, string>>({ cash: pickAccount("cash"), momo: pickAccount("momo"), bank: pickAccount("bank") });

  const total = CHANNELS.reduce((s, c) => s + (Number(amount[c.key]) || 0), 0);

  const checkKey = `${fund.toLowerCase()}|${date}`;
  const warning = already && already.key === checkKey && already.total > 0 ? already : null;
  const busy = pending || checking;

  const save = () => {
    const lines = CHANNELS.filter((c) => Number(amount[c.key]) > 0).map((c) => ({ method: method[c.key], amount: Number(amount[c.key]), accountId: acct[c.key] === NOT_BANKED ? null : acct[c.key] || null, notBanked: acct[c.key] === NOT_BANKED }));
    const pick = service.pick;
    start(async () => {
      const res = await recordCollection({ fund, date, note: pick?.name ?? "", lines, service: pick });
      if (res.ok) {
        service.remember();
        toast(`${fund} of ${formatCurrency(res.total, { decimals: true })} recorded`, "success");
        setAmount({ cash: "", momo: "", bank: "" });
        setAlready(null);
        router.refresh();
        onDone?.();
      } else toast(res.error, "error");
    });
  };

  const submit = async () => {
    if (!(total > 0)) { toast("Enter how much was collected", "error"); return; }
    setChecking(true);
    try {
      const r = await collectionAlreadyRecorded(fund, date);
      if (r.total > 0) { setAlready({ key: checkKey, total: r.total }); return; }
    } catch { /* the check is only a courtesy: carry on */ } finally { setChecking(false); }
    save();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="col-fund">Fund</Label>
          {fundName ? (
            <div className="flex h-10 items-center rounded-xl border border-line bg-surface-2 px-3 text-sm font-medium">{fundName}</div>
          ) : (
            <select id="col-fund" value={fund} onChange={(e) => setFund(e.target.value)} className={sel}>
              {(funds && funds.length ? funds : ["Offertory"]).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
        </div>
        <div><Label htmlFor="col-date">Date</Label><Input id="col-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        {service.field}
      </div>

      <div className="space-y-2.5">
        {CHANNELS.map((c) => {
          const Icon = c.icon;
          const on = Number(amount[c.key]) > 0;
          return (
            <div key={c.key} className={cn("rounded-xl border p-3 transition-colors", on ? "border-primary/40 bg-primary/5" : "border-line")}>
              <div className="flex flex-wrap items-center gap-3">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", on ? "bg-primary/15 text-primary" : "bg-surface-2 text-ink-muted")}><Icon className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{c.label}</div>
                  <div className="text-[11px] text-ink-faint">{c.hint}</div>
                </div>
                <div className="relative w-36">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">₵</span>
                  <input
                    type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
                    value={amount[c.key]}
                    onChange={(e) => setAmount((p) => ({ ...p, [c.key]: e.target.value }))}
                    className="h-10 w-full rounded-xl border border-line bg-surface pl-7 pr-3 text-right text-sm font-medium outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/25"
                  />
                </div>
              </div>
              {on && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-12">
                  {COLLECTION_METHODS[c.key].length > 1 && (
                    <select value={method[c.key]} onChange={(e) => setMethod((p) => ({ ...p, [c.key]: e.target.value }))} className="h-9 rounded-lg border border-line bg-surface px-2 text-xs">
                      {COLLECTION_METHODS[c.key].map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  )}
                  {accounts.length > 0 && (
                    <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <Landmark className="size-3.5" /> into
                      <select value={acct[c.key]} onChange={(e) => setAcct((p) => ({ ...p, [c.key]: e.target.value }))} className="h-9 rounded-lg border border-line bg-surface px-2 text-xs">
                        <option value={NOT_BANKED}>Not banked yet</option>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {warning && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p><b>{formatCurrency(warning.total, { decimals: true })} {fund}</b> is already recorded for {dayLabel(date)}. Record another?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={save} disabled={busy}>{pending ? <><Loader2 className="size-4 animate-spin" /> Recording...</> : "Yes, record another"}</Button>
              <Button size="sm" variant="secondary" onClick={() => setAlready(null)} disabled={busy}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
        <div>
          <div className="text-sm text-ink-muted">Total {fund}</div>
          <div className="font-display text-2xl font-bold tabular-nums">{formatCurrency(total, { decimals: true })}</div>
        </div>
        <Button onClick={submit} disabled={busy || !(total > 0) || !!warning || service.loading} size="lg">
          {checking ? <><Loader2 className="size-4 animate-spin" /> Checking...</> : pending ? <><Loader2 className="size-4 animate-spin" /> Recording...</> : <><Send className="size-4" /> Record {fund}</>}
        </Button>
      </div>
    </div>
  );
}
