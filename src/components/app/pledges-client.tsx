"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFeedback } from "@/components/ui/feedback";
import {
  Search, Target, Calendar, Trash2, CheckCircle2, Clock, HandCoins,
  Phone, BellRing, Settings2, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  recordPledgePayment, deletePledge, deleteCampaign, savePledgeSettings, sendPledgeReminder,
} from "@/app/actions/pledges";
import { cn } from "@/lib/utils";

type CampaignRow = {
  id: string; name: string; goal: number; raised: number; endsAt: string | null; pledgeCount: number;
};
type PaymentRow = { id: string; amount: number; method: string; note: string | null; date: string };
type PledgeRow = {
  id: string;
  donorName: string;
  donorPhone: string | null;
  donorType: string;
  amount: number;
  fulfilled: number;
  dueAt: string | null;
  campaignName: string | null;
  harvestLabel: string | null;
  notes: string | null;
  payments: PaymentRow[];
};

const METHODS = ["Cash", "MTN MoMo", "Telecel Cash", "AirtelTigo", "Card"];
const REMINDER_CHOICES = [60, 30, 14, 7, 3, 1];

function formatGHS(n: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(n);
}
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function PledgesClient({
  campaigns,
  pledges,
  reminderDays,
  receiptTemplate,
  reminderTemplate,
  isDemo,
}: {
  campaigns: CampaignRow[];
  pledges: PledgeRow[];
  reminderDays: number[];
  receiptTemplate: string | null;
  reminderTemplate: string | null;
  isDemo: boolean;
}) {
  const [search, setSearch] = useState("");
  const [payFor, setPayFor] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pending, start] = useTransition();
  const { toast } = useFeedback();
  const router = useRouter();

  const filtered = pledges.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.donorName.toLowerCase().includes(q) ||
      p.campaignName?.toLowerCase().includes(q) ||
      p.harvestLabel?.toLowerCase().includes(q) ||
      p.donorPhone?.includes(q)
    );
  });

  const outstanding = pledges.reduce((s, p) => s + Math.max(0, p.amount - p.fulfilled), 0);
  const pledgedTotal = pledges.reduce((s, p) => s + p.amount, 0);
  const paidTotal = pledges.reduce((s, p) => s + p.fulfilled, 0);

  const simple = (fn: (fd: FormData) => Promise<unknown>, id: string, msg: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(async () => { await fn(fd); toast(msg, "info"); router.refresh(); });
  };

  return (
    <div className={cn("mt-5 space-y-6", pending && "opacity-60")}>
      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <div className="text-xl font-bold">{formatGHS(pledgedTotal)}</div>
          <div className="text-xs text-ink-muted">Total pledged</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xl font-bold text-success">{formatGHS(paidTotal)}</div>
          <div className="text-xs text-ink-muted">Received</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xl font-bold text-gold">{formatGHS(outstanding)}</div>
          <div className="text-xs text-ink-muted">Outstanding</div>
        </Card>
      </div>

      {/* Reminder settings */}
      <Card>
        <button onClick={() => setShowSettings((v) => !v)} className="flex w-full items-center gap-2 p-4 text-left">
          {showSettings ? <ChevronDown className="size-4 text-ink-faint" /> : <ChevronRight className="size-4 text-ink-faint" />}
          <Settings2 className="size-4 text-ink-muted" />
          <span className="flex-1 text-sm font-semibold">Reminder schedule &amp; message</span>
          <span className="text-xs text-ink-faint">
            {reminderDays.length ? `${reminderDays.join(", ")} days before` : "Off"}
          </span>
        </button>
        {showSettings && (
          <form action={savePledgeSettings} className="space-y-4 border-t border-line p-4">
            <div>
              <Label>Auto-remind before the due date</Label>
              <div className="flex flex-wrap gap-2">
                {REMINDER_CHOICES.map((d) => (
                  <label key={d} className={cn(
                    "cursor-pointer rounded-lg border px-3 py-1.5 text-sm",
                    reminderDays.includes(d) ? "border-primary/50 bg-primary/10 text-primary" : "border-line text-ink-muted",
                  )}>
                    <input type="checkbox" name="reminderDays" value={d} defaultChecked={reminderDays.includes(d)} className="mr-1.5 size-3.5 accent-primary align-middle" />
                    {d} day{d !== 1 ? "s" : ""}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-faint">Each person gets one text per milestone — never duplicated.</p>
            </div>
            <div>
              <Label>Pledge confirmation message</Label>
              <textarea name="receiptTemplate" rows={2} defaultValue={receiptTemplate ?? ""}
                placeholder="Dear {name}, your pledge of GHS {amount} to {church} has been recorded{due}. Thank you!"
                className="w-full rounded-xl border border-line bg-base px-3 py-2 text-sm" />
            </div>
            <div>
              <Label>Reminder message</Label>
              <textarea name="reminderTemplate" rows={2} defaultValue={reminderTemplate ?? ""}
                placeholder="Dear {name}, your pledge of GHS {total} is due in {days} day(s). Outstanding: GHS {balance}."
                className="w-full rounded-xl border border-line bg-base px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-ink-faint">
                Placeholders: {"{name}"} {"{amount}"} {"{total}"} {"{balance}"} {"{days}"} {"{church}"} {"{due}"}
              </p>
            </div>
            <SubmitButton disabled={isDemo} pendingLabel="Saving…" successMessage="Reminder settings saved">Save settings</SubmitButton>
          </form>
        )}
      </Card>

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
                    <button onClick={() => simple(deleteCampaign, c.id, "Campaign deleted")}
                      className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-brand">{formatGHS(c.raised)}</span>
                      <span className="text-ink-muted">of {formatGHS(c.goal)}</span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-surface-2">
                      <div className="h-2 rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-right text-[10px] text-ink-faint">{pct}%</p>
                  </div>
                  {c.endsAt && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-ink-muted">
                      <Calendar className="size-3" /> Ends {shortDate(c.endsAt)}
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

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input placeholder="Search by name, phone, campaign or harvest…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
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
              const open = openRow === p.id;

              return (
                <Card key={p.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {isComplete ? <CheckCircle2 className="size-5 text-success" />
                        : isOverdue ? <Clock className="size-5 text-warning" />
                        : <Clock className="size-5 text-info" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{p.donorName}</span>
                        {p.donorType === "visitor" && <Badge variant="default" className="text-[10px]">Visitor</Badge>}
                        {p.campaignName && <Badge variant="default" className="text-[10px]">{p.campaignName}</Badge>}
                        {p.harvestLabel && <Badge variant="gold" className="text-[10px]">{p.harvestLabel}</Badge>}
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
                            <div className={cn("h-1.5 rounded-full transition-all", isComplete ? "bg-success" : "bg-brand")} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <span className="text-xs text-ink-faint">{pct}%</span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-muted">
                        {p.donorPhone && <span className="flex items-center gap-1"><Phone className="size-3" />{p.donorPhone}</span>}
                        {p.dueAt && (
                          <span className={cn("flex items-center gap-1", isOverdue && "font-medium text-warning")}>
                            <Calendar className="size-3" /> Due {shortDate(p.dueAt)}
                          </span>
                        )}
                        {p.payments.length > 0 && (
                          <button onClick={() => setOpenRow(open ? null : p.id)} className="text-primary hover:underline">
                            {p.payments.length} payment{p.payments.length !== 1 ? "s" : ""}
                          </button>
                        )}
                      </div>

                      {open && p.payments.length > 0 && (
                        <div className="mt-2 divide-y divide-line-soft rounded-lg border border-line">
                          {p.payments.map((pay) => (
                            <div key={pay.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                              <span>
                                <span className="font-medium">{formatGHS(pay.amount)}</span>
                                <span className="ml-2 text-ink-faint">{pay.method}{pay.note ? ` · ${pay.note}` : ""}</span>
                              </span>
                              <span className="text-ink-faint">{shortDate(pay.date)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {payFor === p.id && (
                        <form
                          className="mt-2 grid gap-2 rounded-lg border border-line p-2 sm:grid-cols-[7rem_9rem_1fr_auto]"
                          action={(fd) => start(async () => {
                            fd.set("id", p.id);
                            const res = await recordPledgePayment(fd);
                            if (!res?.ok) return toast(res?.error ?? "Couldn't record", "error");
                            toast("Payment recorded", "success");
                            setPayFor(null);
                            router.refresh();
                          })}
                        >
                          <Input name="payment" type="number" step="0.01" min="0" placeholder="Amount" required autoFocus className="h-9" />
                          <select name="method" defaultValue="Cash" className="h-9 rounded-lg border border-line bg-base px-2 text-sm">
                            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <Input name="note" placeholder="Note (optional)" className="h-9" />
                          <div className="flex gap-1">
                            <Button size="sm" type="submit">Record</Button>
                            <Button size="sm" type="button" variant="secondary" onClick={() => setPayFor(null)}>Cancel</Button>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-ink-muted sm:col-span-4">
                            <input type="checkbox" name="notify" defaultChecked value="on" className="size-3.5 accent-primary" />
                            Text them a receipt
                          </label>
                        </form>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col gap-1">
                      {!isComplete && (
                        <Button size="sm" variant="secondary" onClick={() => setPayFor(payFor === p.id ? null : p.id)}>
                          <HandCoins className="size-3.5" /> Pay
                        </Button>
                      )}
                      {!isComplete && p.donorPhone && (
                        <Button size="sm" variant="ghost" title="Send a reminder now"
                          onClick={() => start(async () => {
                            const fd = new FormData(); fd.set("id", p.id);
                            const res = await sendPledgeReminder(fd);
                            toast(res?.ok ? "Reminder sent" : (res?.error ?? "Couldn't send"), res?.ok ? "success" : "error");
                          })}>
                          <BellRing className="size-3.5" />
                        </Button>
                      )}
                      <button onClick={() => simple(deletePledge, p.id, "Pledge deleted")}
                        className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger">
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
