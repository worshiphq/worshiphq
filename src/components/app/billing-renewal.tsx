"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CreditCard, Loader2, ShieldCheck, Trash2, AlertTriangle, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toastNow } from "@/components/ui/feedback";
import { saveCardFromPayment, removeSavedCard, setAutoRenewal, setRenewalCard } from "@/app/actions/billing-cards";
import { cn } from "@/lib/utils";

export type CardRow = { id: string; brand: string | null; last4: string; expMonth: string | null; expYear: string | null; bank: string | null };
export type RenewalSub = {
  plan: string; status: string; interval: string; renewsAt: Date | string | null;
  scheduledPlan?: string | null; cancelAtPeriodEnd?: boolean;
  autoRenew?: boolean; cardId?: string | null; renewalFailures?: number;
};
export type RecentPayment = { id: string; reference: string; source: string; plan: string; paidAt: string; status: string };

const DAY = 86_400_000;
/** Mirrors RENEW_WINDOW_DAYS on the server, which is what actually decides. This only decides what to show. */
const RENEW_WINDOW_DAYS = 7;
const GRACE_DAYS = 7;

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const cardName = (c: CardRow) => `${c.brand ? c.brand.charAt(0).toUpperCase() + c.brand.slice(1) : "Card"} •••• ${c.last4}`;
const expiry = (c: CardRow) => (c.expMonth && c.expYear ? `${c.expMonth.padStart(2, "0")}/${c.expYear.slice(-2)}` : null);

/**
 * Renewal status, the Renew button, automatic renewal and saved cards, in the Billing tab.
 *
 * What this shows is advice; the server decides. Renewing opens the same checkout as any plan change
 * (priced and sealed by the server), and every action here is refused by the server for anyone but the
 * Main Admin, so hiding a control here is a courtesy and never the protection.
 */
export function BillingRenewal({
  sub, planName, priceText, cards, recentPayments, canManage, paymentsLive, justPaidRef, onRenew,
}: {
  sub: RenewalSub;
  planName: string;
  priceText: string;
  cards: CardRow[];
  recentPayments: RecentPayment[];
  canManage: boolean;
  paymentsLive: boolean;
  /** The reference of the payment just made in this visit, so the card can be offered while it is fresh. */
  justPaidRef?: string | null;
  onRenew: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const paid = sub.plan !== "free" && sub.status !== "grace";
  const end = sub.renewsAt ? new Date(sub.renewsAt) : null;
  if (!paid || !end) return null;

  const msLeft = end.getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / DAY);
  const ended = msLeft <= 0;
  const daysOver = ended ? Math.floor(-msLeft / DAY) : 0;
  const graceLeft = Math.max(0, GRACE_DAYS - daysOver);
  const leaving = !!sub.scheduledPlan || !!sub.cancelAtPeriodEnd;
  const canRenewNow = !leaving && (ended || daysLeft <= RENEW_WINDOW_DAYS);
  const selected = cards.find((c) => c.id === sub.cardId) ?? cards[0] ?? null;
  const auto = !!sub.autoRenew && !!selected;
  const failed = (sub.renewalFailures ?? 0) > 0;

  const act = (key: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setBusy(key);
    start(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          if (res.message) toastNow(res.message, "success");
          router.refresh();
        } else {
          toastNow(res.error ?? "That did not work. Please try again.", "error");
        }
      } catch (e) {
        toastNow((e as Error).message || "That did not work. Please try again.", "error");
      } finally {
        setBusy(null);
      }
    });
  };
  const isBusy = (k: string) => pending && busy === k;

  // Paystack payments a card could still be taken from: recent, paid, by Paystack, and not already represented.
  const keepable = recentPayments.filter((p) => p.source === "paystack" && p.status === "paid").slice(0, 3);

  return (
    <div className="space-y-4">
      {/* ── Where the renewal stands ── */}
      <Card className={cn("p-5", ended && "border-danger/40 bg-danger/5", !ended && daysLeft <= RENEW_WINDOW_DAYS && !leaving && "border-warning/40 bg-warning/5")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg", ended ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary-bright")}>
              {ended ? <AlertTriangle className="size-4" /> : <CalendarClock className="size-4" />}
            </span>
            <div>
              <h3 className="font-display text-[1rem] font-semibold">
                {ended ? `Your ${planName} plan has expired` : leaving ? "Your plan is changing" : auto ? "Renews automatically" : "Renewal"}
              </h3>
              <p className="mt-0.5 text-sm text-ink-muted">
                {ended
                  ? graceLeft > 0
                    ? `It ended on ${fmt(end)}. You have ${graceLeft} more day${graceLeft === 1 ? "" : "s"} to renew before your church moves to Free. Nothing you entered is deleted.`
                    : `It ended on ${fmt(end)}. Renew now to switch your features back on.`
                  : leaving
                    ? `You keep ${planName} until ${fmt(end)}, then move as scheduled.`
                    : auto && selected
                      ? `On ${fmt(end)} we charge ${priceText} to ${cardName(selected)}. You will get a heads-up three days before.`
                      : daysLeft <= RENEW_WINDOW_DAYS
                        ? `Ends ${fmt(end)} (${daysLeft <= 1 ? "tomorrow" : `in ${daysLeft} days`}). Renew now and the new period carries on from that date, so you lose no days.`
                        : `Renews on ${fmt(end)} (${daysLeft} days). Renewing opens ${RENEW_WINDOW_DAYS} days before.`}
              </p>
              {failed && (
                <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
                  We could not charge your card for this renewal. {(sub.renewalFailures ?? 0) >= 3 ? "We have stopped trying, so please renew below." : "We will try again, or you can renew now."}
                </p>
              )}
            </div>
          </div>
          {canRenewNow && (
            <Button onClick={onRenew} disabled={!canManage} className="shrink-0">
              <RefreshCw className="size-4" /> Renew {planName} now
            </Button>
          )}
        </div>
      </Card>

      {/* ── Automatic renewal and saved cards ── */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary-bright"><CreditCard className="size-4" /></span>
            <div>
              <h3 className="font-display text-[1rem] font-semibold">Automatic renewal</h3>
              <p className="mt-0.5 max-w-xl text-sm text-ink-muted">
                Keep a card on file and we renew on the date, so nothing stops. Turn it off whenever you like, and we go back to reminding you.
              </p>
            </div>
          </div>
          {selected && (
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                role="switch"
                checked={auto}
                disabled={!canManage || pending}
                onChange={(e) => act("auto", () => setAutoRenewal(e.target.checked))}
                className="size-4 accent-[var(--color-primary)]"
              />
              {isBusy("auto") ? <span className="flex items-center gap-1.5 text-ink-muted"><Loader2 className="size-3.5 animate-spin" /> Saving…</span> : auto ? "On" : "Off"}
            </label>
          )}
        </div>

        {cards.length > 0 ? (
          <ul className="mt-4 divide-y divide-line-soft rounded-xl border border-line">
            {cards.map((c) => {
              const active = c.id === selected?.id;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <CreditCard className="size-4 text-ink-faint" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink">{cardName(c)}{active && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">Used for renewal</span>}</div>
                    <div className="text-xs text-ink-faint">{[expiry(c) && `Expires ${expiry(c)}`, c.bank].filter(Boolean).join(" · ")}</div>
                  </div>
                  {!active && (
                    <Button size="sm" variant="secondary" disabled={!canManage || pending} onClick={() => act(`use-${c.id}`, () => setRenewalCard(c.id))}>
                      {isBusy(`use-${c.id}`) ? <><Loader2 className="size-3.5 animate-spin" /> Switching…</> : "Use this card"}
                    </Button>
                  )}
                  <Button
                    size="sm" variant="ghost" disabled={!canManage || pending}
                    onClick={() => { if (confirm(`Remove ${cardName(c)}?${c.id === selected?.id && cards.length === 1 ? " Automatic renewal will switch off with it." : ""}`)) act(`rm-${c.id}`, () => removeSavedCard(c.id)); }}
                  >
                    {isBusy(`rm-${c.id}`) ? <><Loader2 className="size-3.5 animate-spin" /> Removing…</> : <><Trash2 className="size-3.5" /> Remove</>}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-muted">
            No card saved yet. {paymentsLive ? "When you pay by card, tick “keep my card and renew automatically”, or keep the card from a payment below." : "Card saving is available once live payments are on."}
          </p>
        )}

        {/* Offer the card while the payment is fresh, and from recent payments after the fact. */}
        {canManage && paymentsLive && cards.length === 0 && (justPaidRef || keepable.length > 0) && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Keep the card from a payment</p>
            {(justPaidRef ? [{ id: "just", reference: justPaidRef, plan: "your payment just now", paidAt: "" }] : keepable).map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                <span className="text-sm text-ink-muted">{p.paidAt ? `${p.plan} · ${fmt(new Date(p.paidAt))}` : p.plan}</span>
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(`save-${p.id}`, () => saveCardFromPayment(p.reference))}>
                  {isBusy(`save-${p.id}`) ? <><Loader2 className="size-3.5 animate-spin" /> Saving card…</> : <><ShieldCheck className="size-3.5" /> Keep this card</>}
                </Button>
              </div>
            ))}
            <p className="text-xs text-ink-faint">Only card payments can be kept. Mobile Money has to be approved on your phone each time, so it cannot be renewed automatically. We never see or store your full card number.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
