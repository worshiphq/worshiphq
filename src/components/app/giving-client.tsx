"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Plus, Download, Smartphone, CreditCard, Banknote, X, HandCoins, Repeat, ChevronLeft, ChevronRight,
  ChevronDown, Landmark, Sparkles, Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { FundDonut } from "@/components/app/charts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { OnFormComplete } from "@/components/ui/form-effects";
import { Avatar } from "@/components/ui/avatar";
import { Input, Label } from "@/components/ui/input";
import { recordGift, deleteGift } from "@/app/actions/giving";
import { DeleteForm } from "@/components/app/delete-form";
import { AccountSelect, type AccountOption } from "@/components/app/account-select";
import { CollectionForm } from "@/components/app/collection-form";
import { Modal } from "@/components/ui/modal";
import type { GivingEntry, GivingKind, CollectionEntry } from "@/lib/data/giving";
import { CHANNEL_LABEL, type Channel, type FundKind } from "@/lib/giving/channels";
import { formatCurrency } from "@/config/brand";
import { wideYears } from "@/lib/years";
import { cn } from "@/lib/utils";

const methods = ["MTN MoMo", "Telecel Cash", "AirtelTigo", "Card", "Bank", "Cash"] as const;
const methodIcon: Record<string, typeof Smartphone> = {
  "MTN MoMo": Smartphone, "Telecel Cash": Smartphone, AirtelTigo: Smartphone, Card: CreditCard, Bank: Landmark, Cash: Banknote,
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CHANNEL_ICON: Record<Channel, typeof Banknote> = { cash: Banknote, momo: Smartphone, bank: Landmark };

type Props = {
  year: number;
  month: number;
  kind: GivingKind;
  entries: GivingEntry[];
  pageInfo: { page: number; pages: number; total: number; pageSize: number };
  funds: { name: string; color: string }[];
  stats: {
    total: number; prevTotal: number; byKind: Record<FundKind, number>; byChannel: Record<Channel, number>;
    recurringCount: number; giftCount: number;
  };
  fundBreakdown: { name: string; value: number }[];
  accounts?: AccountOption[];
  canWrite: boolean;
  canDelete?: boolean;
};

const KINDS: { id: GivingKind; label: string }[] = [
  { id: "all", label: "Everything" }, { id: "tithes", label: "Tithes" }, { id: "offertory", label: "Offertory" }, { id: "other", label: "Other funds" },
];

export function GivingClient({ year, month, kind, entries, pageInfo, funds, stats, fundBreakdown, accounts = [], canWrite, canDelete = false }: Props) {
  const [recording, setRecording] = useState<"gift" | "collection" | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  // Giving has its own period (gy/gm); the tithe recorder below keeps its own.
  const go = (patch: { y?: number; m?: number; k?: GivingKind; p?: number }) => {
    const sp = new URLSearchParams(window.location.search);
    const y = patch.y ?? year, m = patch.m ?? month, k = patch.k ?? kind;
    sp.set("gy", String(y)); sp.set("gm", String(m));
    if (k === "all") sp.delete("gk"); else sp.set("gk", k);
    if (patch.p && patch.p > 1) sp.set("gp", String(patch.p)); else sp.delete("gp");
    start(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
  };
  const step = (d: -1 | 1) => { const m = month + d; go(m < 0 ? { y: year - 1, m: 11 } : m > 11 ? { y: year + 1, m: 0 } : { m }); };

  const delta = stats.prevTotal > 0 ? Math.round(((stats.total - stats.prevTotal) / stats.prevTotal) * 100) : null;
  const momoPct = stats.total ? Math.round((stats.byChannel.momo / stats.total) * 100) : 0;
  const years = wideYears();
  const offertoryNames = [...new Set(funds.map((f) => f.name).filter((n) => /offer/i.test(n)))];
  const collectionFunds = offertoryNames.length ? offertoryNames : ["Offertory"];

  return (
    <div>
      <PageHeader title="Giving & donations" description="Tithes, offertory and Mobile Money giving, all in ₵. Offertory is counted together, so it shows as one total.">
        <a href="/api/export/giving"><Button variant="secondary" size="sm"><Download /> Export Excel</Button></a>
        <Button variant="secondary" size="sm" onClick={() => setRecording("gift")} disabled={!canWrite}><Plus /> Record a gift</Button>
        <Button size="sm" onClick={() => setRecording("collection")} disabled={!canWrite}><HandCoins /> Record offertory</Button>
      </PageHeader>

      {/* Period + kind */}
      <Card className="mb-4 p-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <button onClick={() => step(-1)} className="grid size-8 place-items-center rounded-lg border border-line text-ink-muted hover:bg-surface-2" aria-label="Previous month"><ChevronLeft className="size-4" /></button>
            <select value={month} onChange={(e) => go({ m: Number(e.target.value) })} className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm font-medium">
              {MONTHS.map((n, i) => <option key={n} value={i}>{n}</option>)}
            </select>
            <select value={year} onChange={(e) => go({ y: Number(e.target.value) })} className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm font-medium">
              {(years.includes(year) ? years : [year, ...years]).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={() => step(1)} className="grid size-8 place-items-center rounded-lg border border-line text-ink-muted hover:bg-surface-2" aria-label="Next month"><ChevronRight className="size-4" /></button>
          </div>
          <div className="inline-flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
            {KINDS.map((k) => (
              <button key={k.id} onClick={() => go({ k: k.id })} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", kind === k.id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>{k.label}</button>
            ))}
          </div>
          {pending && <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
        </div>
      </Card>

      <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", pending && "opacity-60")}>
        <Stat label={`${MONTHS[month]} giving`} value={stats.total} icon={HandCoins} note={delta != null ? <span className={delta >= 0 ? "text-success" : "text-danger"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs last month</span> : `${stats.giftCount} records`} />
        <Stat label="Tithes" value={stats.byKind.tithes} icon={Sparkles} note={stats.total ? `${Math.round((stats.byKind.tithes / stats.total) * 100)}% of giving` : ""} />
        <Stat label="Offertory" value={stats.byKind.offertory} icon={Wallet} note={stats.total ? `${Math.round((stats.byKind.offertory / stats.total) * 100)}% of giving` : ""} />
        <Stat label="Mobile Money" value={stats.byChannel.momo} icon={Smartphone} note={`${momoPct}% of giving`} />
      </div>

      <div className={cn("mt-4 grid gap-4 lg:grid-cols-3", pending && "opacity-60")}>
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line p-5">
            <div>
              <h3 className="font-display text-lg font-semibold">Giving activity</h3>
              <p className="text-xs text-ink-muted">{MONTHS[month]} {year}{kind !== "all" ? ` · ${KINDS.find((k) => k.id === kind)?.label}` : ""} · {pageInfo.total} {pageInfo.total === 1 ? "line" : "lines"}</p>
            </div>
            {stats.recurringCount > 0 && <span className="flex items-center gap-1 text-xs text-ink-faint"><Repeat className="size-3.5" /> {stats.recurringCount} recurring givers</span>}
          </div>
          {entries.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink-muted">
              Nothing recorded {kind !== "all" ? "for this" : "in"} {kind !== "all" ? "kind of giving" : "this month"}.{canWrite && " Use “Record offertory” or “Record a gift” to add some."}
            </div>
          ) : (
            <div className="divide-y divide-line-soft">
              {entries.map((e) => (e.type === "collection"
                ? <CollectionRow key={e.id} c={e} canDelete={canDelete} />
                : <GiftRow key={e.id} g={e} canDelete={canDelete} />))}
            </div>
          )}
          {pageInfo.pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <span className="text-xs text-ink-faint">Page {pageInfo.page} of {pageInfo.pages}</span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="secondary" disabled={pageInfo.page <= 1 || pending} onClick={() => go({ p: pageInfo.page - 1 })}><ChevronLeft className="size-4" /> Newer</Button>
                <Button size="sm" variant="secondary" disabled={pageInfo.page >= pageInfo.pages || pending} onClick={() => go({ p: pageInfo.page + 1 })}>Older <ChevronRight className="size-4" /></Button>
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="border-b border-line p-5">
              <h3 className="font-display text-lg font-semibold">Giving by fund</h3>
              <p className="text-sm text-ink-muted">{MONTHS[month]} · {formatCurrency(stats.total)}</p>
            </div>
            <div className="p-5">
              {fundBreakdown.length ? <FundDonut data={fundBreakdown} /> : <p className="text-sm text-ink-faint">No giving yet this month.</p>}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-display text-lg font-semibold">How it came in</h3>
            <div className="space-y-3">
              {(Object.keys(CHANNEL_LABEL) as Channel[]).map((ch) => {
                const Icon = CHANNEL_ICON[ch];
                const v = stats.byChannel[ch];
                const pct = stats.total ? (v / stats.total) * 100 : 0;
                return (
                  <div key={ch}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-ink-muted"><Icon className="size-3.5" /> {CHANNEL_LABEL[ch]}</span>
                      <span className="font-medium tabular-nums">{formatCurrency(v)} <span className="text-xs text-ink-faint">{Math.round(pct)}%</span></span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      {recording === "gift" && <RecordGiftDialog funds={funds} accounts={accounts} onClose={() => setRecording(null)} />}
      {recording === "collection" && (
        <Modal open onClose={() => setRecording(null)} title="Record offertory" description="Counted together, so just enter the totals. No names needed.">
          <CollectionForm funds={collectionFunds} accounts={accounts} onDone={() => setRecording(null)} />
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, note }: { label: string; value: number; icon: typeof Banknote; note?: React.ReactNode }) {
  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-muted">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg border border-line bg-surface-2 text-primary-bright"><Icon className="size-4" /></span>
      </div>
      <div className="mt-2 font-display text-2xl font-bold tracking-tight tabular-nums">{formatCurrency(value)}</div>
      {note ? <div className="mt-1 text-[11px] text-ink-faint">{note}</div> : null}
    </div>
  );
}

/** Tithes and other named giving: one person per line. */
function GiftRow({ g, canDelete }: { g: Extract<GivingEntry, { type: "gift" }>; canDelete: boolean }) {
  const Icon = methodIcon[g.method] ?? Banknote;
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <Avatar name={g.donor} src={g.photoUrl ?? undefined} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{g.donor}</span>
          {g.recurring && <Repeat className="size-3 text-ink-faint" />}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ink-faint"><Icon className="size-3" /> {g.method} · {g.fund}</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold text-success tabular-nums">{formatCurrency(g.amount, { decimals: true })}</div>
        <div className="text-xs text-ink-faint">{new Date(g.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
      </div>
      {canDelete && <DeleteForm action={deleteGift.bind(null, g.id)} confirm={`Delete this ₵${g.amount} gift from ${g.donor}?`} />}
    </div>
  );
}

/** A day's offertory: one total, split by channel, no names. */
function CollectionRow({ c, canDelete }: { c: CollectionEntry; canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  const chips = (Object.keys(CHANNEL_LABEL) as Channel[]).filter((ch) => c.channels[ch] > 0);
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-2/40">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><HandCoins className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">{c.fund}</span>
            <ChevronDown className={cn("size-3.5 text-ink-faint transition-transform", open && "rotate-180")} />
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {chips.map((ch) => {
              const Icon = CHANNEL_ICON[ch];
              return (
                <span key={ch} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-muted">
                  <Icon className="size-3" /> {CHANNEL_LABEL[ch]} <b className="font-semibold text-ink">{formatCurrency(c.channels[ch], { decimals: true })}</b>
                </span>
              );
            })}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-success tabular-nums">{formatCurrency(c.total, { decimals: true })}</div>
          <div className="text-xs text-ink-faint">{new Date(c.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</div>
        </div>
      </button>
      {open && (
        <div className="border-t border-line-soft bg-surface-2/30 px-5 py-2">
          {c.lines.map((l, i) => (
            <div key={l.id ?? `${l.channel}-${i}`} className="flex items-center gap-3 py-1.5 pl-12 text-sm">
              <span className="min-w-0 flex-1 text-ink-muted">{l.label}{l.count > 1 ? ` · ${l.count} gifts` : ""}</span>
              <span className="tabular-nums font-medium">{formatCurrency(l.amount, { decimals: true })}</span>
              {canDelete && l.deletable && l.id ? (
                <DeleteForm action={deleteGift.bind(null, l.id)} confirm={`Delete this ₵${l.amount} ${l.label} part of the ${c.fund.toLowerCase()}?`} />
              ) : <span className="size-8" />}
            </div>
          ))}
          {c.lines.some((l) => !l.deletable) && <p className="pb-1.5 pl-12 text-[11px] text-ink-faint">Online and named gifts are managed from Accounting.</p>}
        </div>
      )}
    </div>
  );
}

/** One named gift (a person gave something). */
function RecordGiftDialog({ funds, accounts, onClose }: { funds: { name: string }[]; accounts: AccountOption[]; onClose: () => void }) {
  const [method, setMethod] = useState<(typeof methods)[number]>("MTN MoMo");
  const fundOptions = funds.length ? funds.map((f) => f.name) : ["Tithes", "Offertory", "Building Fund", "Missions", "Welfare"];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 max-h-[92dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl animate-fade-up">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Record a gift</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2"><X className="size-5" /></button>
        </div>
        <p className="-mt-3 mb-4 text-xs text-ink-muted">For a gift from one person (tithes, a pledge payment, a donation). For the Sunday offering, use “Record offertory”.</p>
        <form action={recordGift} className="space-y-4">
          <input type="hidden" name="method" value={method} />
          <div><Label htmlFor="donor">Donor</Label><Input id="donor" name="donor" placeholder="Member name (or leave as Anonymous)" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="amount">Amount (₵)</Label><Input id="amount" name="amount" type="number" min="1" step="0.01" placeholder="100" required /></div>
            <div>
              <Label htmlFor="fund">Fund</Label>
              <select id="fund" name="fund" className="flex h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                {fundOptions.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div><Label htmlFor="gdate">Date</Label><Input id="gdate" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
          <div>
            <Label>Paid by</Label>
            <div className="grid grid-cols-3 gap-2">
              {methods.map((m) => {
                const Icon = methodIcon[m];
                return (
                  <button key={m} type="button" onClick={() => setMethod(m)}
                    className={cn("flex flex-col items-center gap-1 rounded-xl border p-2.5 text-[11px] font-medium transition-colors",
                      method === m ? "border-primary/50 bg-primary/10 text-ink" : "border-line text-ink-muted hover:bg-surface-2")}>
                    <Icon className="size-4" /> {m}
                  </button>
                );
              })}
            </div>
          </div>
          {accounts.length > 0 && <AccountSelect accounts={accounts} name="accountId" />}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <SubmitButton className="flex-1" pendingLabel="Recording…" successMessage="Gift recorded">Record gift</SubmitButton>
          </div>
          <OnFormComplete onComplete={onClose} />
        </form>
      </div>
    </>
  );
}
