"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, Gift, Landmark, MessageSquare, Receipt, Sparkles, Users, Wallet, CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PaymentItem = {
  id: string;
  kind: "plan" | "sms";
  at: string;
  title: string;
  /** Second line: how it was paid, the reference, or the note. */
  detail: string;
  /** Money shown in the display currency (plans) and in cedis. */
  amountDisplay: number | null;
  amountGhs: number;
  discountDisplay?: number;
  source: "paystack" | "offline" | "granted";
  status: "paid" | "refunded";
  canRefund?: boolean;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The plan at a glance: name, price, when it renews and how much of the period is left. */
export function PlanHero({
  planName, members, priceText, status, renewsAt, interval, scheduledText, onChange, canChange, isFree,
}: {
  planName: string;
  members: string;
  priceText: string;
  status: "active" | "grace" | "free";
  renewsAt: string | null;
  interval: string;
  scheduledText?: string;
  onChange: () => void;
  canChange: boolean;
  isFree: boolean;
}) {
  const [now] = useState(() => Date.now());
  const end = renewsAt ? new Date(renewsAt).getTime() : null;
  const daysLeft = end ? Math.max(0, Math.ceil((end - now) / 86400000)) : null;
  // Elapsed share of the paid period (a month, or a year, or longer for multi-year terms).
  const totalDays = end ? Math.max(daysLeft ?? 0, interval === "yearly" ? 365 : 30) : 0;
  const used = daysLeft !== null && totalDays ? Math.min(100, Math.max(0, Math.round(((totalDays - daysLeft) / totalDays) * 100))) : 0;

  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-primary p-6 text-white sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/75">
              <Sparkles className="size-3.5" /> Your plan
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <h3 className="font-display text-3xl font-bold tracking-tight">{planName}</h3>
              {status === "grace" && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">Gift of Grace</span>}
              {status === "active" && !isFree && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">Active</span>}
            </div>
            <p className="mt-1 text-sm text-white/80">{members}</p>
          </div>
          <div className="text-right">
            <div className="font-display text-3xl font-bold tracking-tight">{priceText}</div>
            {daysLeft !== null && !isFree && status !== "grace" && (
              <div className="mt-0.5 text-sm text-white/80">Renews {fmtDate(renewsAt!)}</div>
            )}
          </div>
        </div>

        {daysLeft !== null && !isFree && status !== "grace" && (
          <div className="mt-5">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white" style={{ width: `${used}%` }} />
            </div>
            <div className="mt-1.5 text-xs text-white/75">{daysLeft === 0 ? "Renews today" : `${daysLeft.toLocaleString()} day${daysLeft === 1 ? "" : "s"} left in this period`}</div>
          </div>
        )}
        {scheduledText && <p className="mt-4 rounded-lg bg-white/15 px-3 py-2 text-sm">{scheduledText}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-surface px-6 py-4 sm:px-7">
        {status !== "grace" && (
          <Button onClick={onChange} disabled={!canChange}>
            {isFree ? "Upgrade your plan" : "Change plan"}
          </Button>
        )}
        <Link href="/app/communications/credits" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-4 text-sm font-medium text-ink hover:bg-surface-2">
          <MessageSquare className="size-4" /> Buy SMS credits
        </Link>
        {status === "grace" && <span className="text-sm text-ink-muted">Your plan is free for as long as your church is on WorshipHQ.</span>}
      </div>
    </Card>
  );
}

function Tile({ icon: Icon, label, value, sub, pct, action }: { icon: typeof Users; label: string; value: string; sub?: string; pct?: number | null; action?: React.ReactNode }) {
  const high = (pct ?? 0) >= 90;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm text-ink-muted"><Icon className="size-4" /> {label}</span>
        {action}
      </div>
      <div className="mt-2 font-display text-2xl font-bold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-ink-faint">{sub}</div>}
      {pct != null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className={cn("h-full rounded-full", high ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      )}
    </Card>
  );
}

/** Members, team seats and SMS credits against what the plan allows. */
export function UsageTiles({ members, memberLimit, teamUsers, teamLimit, smsCredits }: { members: number; memberLimit: number | null; teamUsers: number; teamLimit: number | null; smsCredits: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Tile icon={Users} label="Members" value={members.toLocaleString()} sub={memberLimit ? `of ${memberLimit.toLocaleString()} on your plan` : "No limit on your plan"} pct={memberLimit ? (members / memberLimit) * 100 : null} />
      <Tile icon={Wallet} label="Team logins" value={teamUsers.toLocaleString()} sub={teamLimit ? `of ${teamLimit.toLocaleString()} on your plan` : "No limit on your plan"} pct={teamLimit ? (teamUsers / teamLimit) * 100 : null} />
      <Tile
        icon={MessageSquare}
        label="SMS credits"
        value={smsCredits.toLocaleString()}
        sub={smsCredits <= 20 ? "Running low" : "Never expire"}
        action={<Link href="/app/communications/credits" className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline">Top up <ArrowUpRight className="size-3" /></Link>}
      />
    </div>
  );
}

const SOURCE: Record<PaymentItem["source"], { label: string; cls: string; icon: typeof CreditCard }> = {
  paystack: { label: "Paid online", cls: "bg-success/10 text-success", icon: CreditCard },
  offline: { label: "Paid directly", cls: "bg-info/10 text-info", icon: Landmark },
  granted: { label: "Gift", cls: "bg-gold/15 text-gold", icon: Gift },
};

const PAGE = 8;

/** Every plan payment, gift and SMS top-up in one list, filtered and paged. */
export function PaymentHistory({ items, sym, onRefund }: { items: PaymentItem[]; sym: string; onRefund: (id: string) => void }) {
  const [filter, setFilter] = useState<"all" | "plan" | "sms">("all");
  const [page, setPage] = useState(1);
  const list = useMemo(() => items.filter((i) => filter === "all" || i.kind === filter).sort((a, b) => b.at.localeCompare(a.at)), [items, filter]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const current = Math.min(page, pages);
  const shown = list.slice((current - 1) * PAGE, current * PAGE);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
        <h3 className="flex items-center gap-2 font-display text-[1rem] font-semibold"><Receipt className="size-4" /> Payments and receipts</h3>
        <div className="flex gap-1">
          {([["all", "Everything"], ["plan", "Plan"], ["sms", "SMS credits"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => { setFilter(k); setPage(1); }}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", filter === k ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-muted hover:bg-surface-2")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="p-8 text-center text-sm text-ink-muted">Nothing here yet. Every payment, gift and SMS top-up will show up here.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {shown.map((p) => {
            const src = SOURCE[p.source];
            const Icon = p.kind === "sms" ? MessageSquare : src.icon;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-muted"><Icon className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium capitalize text-ink">{p.title}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", p.status === "refunded" ? "bg-ink-faint/10 text-ink-faint" : src.cls)}>
                      {p.status === "refunded" ? "Refunded" : src.label}
                    </span>
                  </div>
                  <div className="truncate text-xs text-ink-faint">{fmtDate(p.at)}{p.detail ? ` · ${p.detail}` : ""}</div>
                </div>
                <div className="text-right">
                  {p.source === "granted" ? (
                    <div className="text-sm font-semibold text-gold">Free</div>
                  ) : (
                    <>
                      <div className="text-sm font-semibold">
                        {p.amountDisplay !== null ? `${sym}${p.amountDisplay.toLocaleString()}` : `₵${p.amountGhs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        {!!p.discountDisplay && <span className="ml-1 text-xs font-normal text-success">-{sym}{p.discountDisplay.toLocaleString()}</span>}
                      </div>
                      {p.amountDisplay !== null && <div className="text-[11px] text-ink-faint">₵{p.amountGhs.toLocaleString()}</div>}
                    </>
                  )}
                </div>
                {p.canRefund && p.status !== "refunded" && (
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => onRefund(p.id)}>Request refund</Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
          <span className="text-xs text-ink-faint">{(current - 1) * PAGE + 1} to {Math.min(current * PAGE, list.length)} of {list.length}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={current <= 1} onClick={() => setPage(current - 1)}><ChevronLeft className="size-4" /> Newer</Button>
            <span className="text-xs text-ink-muted">Page {current} of {pages}</span>
            <Button size="sm" variant="secondary" disabled={current >= pages} onClick={() => setPage(current + 1)}>Older <ChevronRight className="size-4" /></Button>
          </div>
        </div>
      )}
    </Card>
  );
}
