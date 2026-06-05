"use client";

import { useState } from "react";
import { Plus, Download, Smartphone, CreditCard, Banknote, X, Check, HandCoins, Repeat } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { FundDonut } from "@/components/app/charts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Input, Label } from "@/components/ui/input";
import { gifts, fundBreakdown, funds, type GiftMethod } from "@/lib/demo/data";
import { formatCurrency } from "@/config/brand";
import { formatDate, cn } from "@/lib/utils";

const methodIcon: Record<GiftMethod, typeof Smartphone> = {
  "MTN MoMo": Smartphone,
  "Telecel Cash": Smartphone,
  AirtelTigo: Smartphone,
  Card: CreditCard,
  Cash: Banknote,
};

const methodColor: Record<GiftMethod, string> = {
  "MTN MoMo": "text-[#FFCC00]",
  "Telecel Cash": "text-[#E30613]",
  AirtelTigo: "text-[#0066B3]",
  Card: "text-primary-bright",
  Cash: "text-success",
};

export default function GivingPage() {
  const [recording, setRecording] = useState(false);
  const monthTotal = fundBreakdown.reduce((s, f) => s + f.value, 0);

  return (
    <div>
      <PageHeader title="Giving & donations" description="Tithes, offerings and Mobile Money giving — all in ₵.">
        <Button variant="secondary" size="sm">
          <Download /> Statements
        </Button>
        <Button size="sm" onClick={() => setRecording(true)}>
          <Plus /> Record gift
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="This month" value={monthTotal} prefix="₵" change={12.1} icon={HandCoins} />
        <StatCard label="Recurring givers" value={86} change={6.4} icon={Repeat} />
        <StatCard label="Mobile Money %" value={72} suffix="%" change={4.2} icon={Smartphone} />
        <StatCard label="Avg. gift" value={186} prefix="₵" change={2.1} icon={Banknote} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">Recent giving</h3>
            <Badge variant="success">Live</Badge>
          </div>
          <div className="divide-y divide-line-soft">
            {gifts.slice(0, 9).map((g) => {
              const Icon = methodIcon[g.method];
              return (
                <div key={g.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={g.donor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{g.donor}</span>
                      {g.recurring && <Repeat className="size-3 text-ink-faint" />}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-ink-faint">
                      <Icon className={cn("size-3", methodColor[g.method])} />
                      {g.method} · {g.fund}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-success">{formatCurrency(g.amount)}</div>
                    <div className="text-xs text-ink-faint">{formatDate(g.date)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="border-b border-line p-5">
              <h3 className="font-display text-lg font-semibold">Giving by fund</h3>
              <p className="text-sm text-ink-muted">This month · {formatCurrency(monthTotal)}</p>
            </div>
            <div className="p-5">
              <FundDonut data={fundBreakdown} />
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-display text-lg font-semibold">Active funds</h3>
            <div className="space-y-2">
              {funds.map((f) => (
                <div key={f.id} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: f.color }} />
                  <span className="text-ink-muted">{f.name}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {recording && <RecordGiftDialog onClose={() => setRecording(false)} />}
    </div>
  );
}

function RecordGiftDialog({ onClose }: { onClose: () => void }) {
  const [method, setMethod] = useState<GiftMethod>("MTN MoMo");
  const [state, setState] = useState<"form" | "processing" | "done">("form");

  const methods: GiftMethod[] = ["MTN MoMo", "Telecel Cash", "AirtelTigo", "Card", "Cash"];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (method === "Cash") return setState("done");
    setState("processing");
    // Stubbed Paystack initialize → in real mode this redirects to the MoMo prompt.
    setTimeout(() => setState("done"), 1400);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 shadow-2xl animate-fade-up">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Record a gift</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2">
            <X className="size-5" />
          </button>
        </div>

        {state === "done" ? (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="mb-4 grid size-14 place-items-center rounded-full bg-success/15 text-success">
              <Check className="size-7" />
            </div>
            <h3 className="font-display text-lg font-semibold">Gift recorded</h3>
            <p className="mt-1 max-w-xs text-sm text-ink-muted">
              An automated receipt has been queued (logged in stub mode). Add your Paystack key to charge for real.
            </p>
            <Button className="mt-5 w-full" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="donor">Donor</Label>
              <Input id="donor" placeholder="Search or enter name" defaultValue="Kofi Asante" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="amount">Amount (₵)</Label>
                <Input id="amount" type="number" placeholder="100" defaultValue="200" />
              </div>
              <div>
                <Label htmlFor="fund">Fund</Label>
                <select id="fund" className="flex h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                  {funds.map((f) => <option key={f.id}>{f.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label>Method</Label>
              <div className="grid grid-cols-3 gap-2">
                {methods.map((m) => {
                  const Icon = methodIcon[m];
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl border p-2.5 text-[11px] font-medium transition-colors",
                        method === m ? "border-primary/50 bg-primary/10 text-ink" : "border-line text-ink-muted hover:bg-surface-2",
                      )}
                    >
                      <Icon className={cn("size-4", methodColor[m])} />
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
            {method !== "Cash" && method !== "Card" && (
              <div>
                <Label htmlFor="momo">Mobile Money number</Label>
                <Input id="momo" placeholder="024 000 0000" defaultValue="024 123 4567" />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={state === "processing"}>
              {state === "processing" ? "Sending MoMo prompt…" : method === "Cash" ? "Record cash gift" : `Charge ${method}`}
            </Button>
          </form>
        )}
      </div>
    </>
  );
}
