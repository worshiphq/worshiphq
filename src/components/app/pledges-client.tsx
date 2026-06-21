"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Target, User, Calendar, Trash2, CheckCircle2, Clock, HandCoins,
} from "lucide-react";
import { recordPledgePayment, deletePledge, deleteCampaign } from "@/app/actions/pledges";

type CampaignRow = {
  id: string;
  name: string;
  goal: number;
  raised: number;
  endsAt: string | null;
  pledgeCount: number;
};

type PledgeRow = {
  id: string;
  donorName: string;
  amount: number;
  fulfilled: number;
  dueAt: string | null;
  campaignName: string | null;
};

function formatGHS(n: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(n);
}

export function PledgesClient({
  campaigns,
  pledges,
}: {
  campaigns: CampaignRow[];
  pledges: PledgeRow[];
}) {
  const [search, setSearch] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentAmt, setPaymentAmt] = useState("");
  const [pending, start] = useTransition();

  const filtered = pledges.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.donorName.toLowerCase().includes(q) || p.campaignName?.toLowerCase().includes(q);
  });

  const handlePayment = (id: string) => {
    const amt = parseFloat(paymentAmt);
    if (!amt || amt <= 0) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set("payment", String(amt));
    start(() => recordPledgePayment(fd));
    setPaymentId(null);
    setPaymentAmt("");
  };

  const handleDeletePledge = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => deletePledge(fd));
  };

  const handleDeleteCampaign = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => deleteCampaign(fd));
  };

  return (
    <div className={`mt-5 space-y-6 ${pending ? "opacity-60" : ""}`}>
      {campaigns.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Target className="size-4" /> Campaigns
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((c) => {
              const pct = c.goal > 0 ? Math.min(100, Math.round((c.raised / c.goal) * 100)) : 0;
              return (
                <Card key={c.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">{c.name}</h3>
                      <p className="mt-0.5 text-xs text-ink-muted">{c.pledgeCount} pledge{c.pledgeCount !== 1 ? "s" : ""}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteCampaign(c.id)}
                      className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>

                  <div className="mt-3">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-brand">{formatGHS(c.raised)}</span>
                      <span className="text-ink-muted">of {formatGHS(c.goal)}</span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-surface-2">
                      <div
                        className="h-2 rounded-full bg-brand transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-right text-[10px] text-ink-faint">{pct}%</p>
                  </div>

                  {c.endsAt && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-ink-muted">
                      <Calendar className="size-3" />
                      Ends {new Date(c.endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <HandCoins className="size-4" /> Pledges
        </h2>

        <div className="mb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input
              placeholder="Search pledges..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <HandCoins className="mx-auto size-10 text-ink-faint" />
            <p className="mt-3 text-sm text-ink-muted">
              {search ? "No pledges match your search." : "No pledges yet. Record a pledge to start tracking."}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => {
              const pct = p.amount > 0 ? Math.round((p.fulfilled / p.amount) * 100) : 0;
              const isComplete = p.fulfilled >= p.amount;
              const isOverdue = p.dueAt && !isComplete && new Date(p.dueAt) < new Date();

              return (
                <Card key={p.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {isComplete ? (
                        <CheckCircle2 className="size-5 text-success" />
                      ) : isOverdue ? (
                        <Clock className="size-5 text-warning" />
                      ) : (
                        <Clock className="size-5 text-info" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{p.donorName}</span>
                        {p.campaignName && (
                          <Badge variant="default" className="text-[10px]">{p.campaignName}</Badge>
                        )}
                        {isComplete && <Badge variant="default" className="bg-success/10 text-success text-[10px]">Fulfilled</Badge>}
                        {isOverdue && <Badge variant="gold" className="text-[10px]">Overdue</Badge>}
                      </div>

                      <div className="mt-1.5 flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium">{formatGHS(p.fulfilled)}</span>
                            <span className="text-ink-muted">of {formatGHS(p.amount)}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                            <div
                              className={`h-1.5 rounded-full transition-all ${isComplete ? "bg-success" : "bg-brand"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-xs text-ink-faint">{pct}%</span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-ink-muted">
                        {p.dueAt && (
                          <span className={`flex items-center gap-1 ${isOverdue ? "text-warning font-medium" : ""}`}>
                            <Calendar className="size-3" />
                            Due {new Date(p.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>

                      {paymentId === p.id && (
                        <div className="mt-2 flex items-center gap-2">
                          <Input
                            type="number"
                            placeholder="Amount"
                            value={paymentAmt}
                            onChange={(e) => setPaymentAmt(e.target.value)}
                            className="w-32"
                            autoFocus
                          />
                          <Button size="sm" onClick={() => handlePayment(p.id)}>Record</Button>
                          <Button size="sm" variant="secondary" onClick={() => { setPaymentId(null); setPaymentAmt(""); }}>Cancel</Button>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 gap-1">
                      {!isComplete && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setPaymentId(paymentId === p.id ? null : p.id)}
                        >
                          <HandCoins className="size-3.5" /> Pay
                        </Button>
                      )}
                      <button
                        onClick={() => handleDeletePledge(p.id)}
                        className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
