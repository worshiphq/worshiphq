"use client";

import { useState } from "react";
import { Plus, Download, Smartphone, CreditCard, Banknote, X, HandCoins, Repeat } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { FundDonut } from "@/components/app/charts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { OnFormComplete } from "@/components/ui/form-effects";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Input, Label } from "@/components/ui/input";
import { recordGift } from "@/app/actions/giving";
import type { GiftRow } from "@/lib/data/giving";
import { formatCurrency } from "@/config/brand";
import { formatDate, cn } from "@/lib/utils";

const methods = ["MTN MoMo", "Telecel Cash", "AirtelTigo", "Card", "Cash"] as const;
const methodIcon: Record<string, typeof Smartphone> = {
  "MTN MoMo": Smartphone, "Telecel Cash": Smartphone, AirtelTigo: Smartphone, Card: CreditCard, Cash: Banknote,
};

type Props = {
  rows: GiftRow[];
  funds: { name: string; color: string }[];
  stats: { monthTotal: number; avgGift: number; recurringCount: number; momoPct: number };
  fundBreakdown: { name: string; value: number }[];
  canWrite: boolean;
};

export function GivingClient({ rows, funds, stats, fundBreakdown, canWrite }: Props) {
  const [recording, setRecording] = useState(false);

  return (
    <div>
      <PageHeader title="Giving & donations" description="Tithes, offerings and Mobile Money giving — all in ₵.">
        <Button variant="secondary" size="sm"><Download /> Statements</Button>
        <Button size="sm" onClick={() => setRecording(true)} disabled={!canWrite}><Plus /> Record gift</Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="This month" value={stats.monthTotal} prefix="₵" icon={HandCoins} />
        <StatCard label="Recurring givers" value={stats.recurringCount} icon={Repeat} />
        <StatCard label="Mobile Money %" value={stats.momoPct} suffix="%" icon={Smartphone} />
        <StatCard label="Avg. gift" value={stats.avgGift} prefix="₵" icon={Banknote} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">Recent giving</h3>
            <Badge variant="success">Live</Badge>
          </div>
          {rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink-muted">
              No gifts recorded yet.{canWrite && " Click “Record gift” to add your first."}
            </div>
          ) : (
            <div className="divide-y divide-line-soft">
              {rows.map((g) => {
                const Icon = methodIcon[g.method] ?? Banknote;
                return (
                  <div key={g.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={g.donor} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{g.donor}</span>
                        {g.recurring && <Repeat className="size-3 text-ink-faint" />}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-ink-faint"><Icon className="size-3" /> {g.method} · {g.fund}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-success">{formatCurrency(g.amount)}</div>
                      <div className="text-xs text-ink-faint">{formatDate(g.date)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="border-b border-line p-5">
              <h3 className="font-display text-lg font-semibold">Giving by fund</h3>
              <p className="text-sm text-ink-muted">This month · {formatCurrency(stats.monthTotal)}</p>
            </div>
            <div className="p-5">
              {fundBreakdown.length ? <FundDonut data={fundBreakdown} /> : <p className="text-sm text-ink-faint">No giving yet this month.</p>}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-display text-lg font-semibold">Funds</h3>
            <div className="space-y-2">
              {funds.length ? funds.map((f) => (
                <div key={f.name} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: f.color }} />
                  <span className="text-ink-muted">{f.name}</span>
                </div>
              )) : <p className="text-sm text-ink-faint">Funds appear as you record giving.</p>}
            </div>
          </Card>
        </div>
      </div>

      {recording && <RecordGiftDialog funds={funds} onClose={() => setRecording(false)} />}
    </div>
  );
}

function RecordGiftDialog({ funds, onClose }: { funds: { name: string }[]; onClose: () => void }) {
  const [method, setMethod] = useState<(typeof methods)[number]>("MTN MoMo");
  const fundOptions = funds.length ? funds.map((f) => f.name) : ["Tithes", "Sunday Offering", "Building Fund", "Missions", "Welfare"];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 shadow-2xl animate-fade-up">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Record a gift</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2"><X className="size-5" /></button>
        </div>
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
          <div>
            <Label>Method</Label>
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
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <SubmitButton className="flex-1" pendingLabel="Recording…" successMessage="Gift recorded">Record gift</SubmitButton>
          </div>
          <OnFormComplete onComplete={onClose} />
        </form>
        <p className="mt-3 text-center text-xs text-ink-faint">Recorded in your church&rsquo;s ledger. Add a Paystack key to charge MoMo for real.</p>
      </div>
    </>
  );
}
