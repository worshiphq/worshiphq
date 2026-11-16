"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { pricingCredits, pricingPrice, ghsToUsd, type SmsPricing } from "@/config/sms";
import { buySmsCredits, buyCustomSmsCredits, setWelcomeSms, setWelcomeVisitorSms } from "@/app/actions/sms-credits";
import { setLeaderMessaging } from "@/app/actions/leader-messages";
import { Input } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { usePaystack } from "@/components/payments/use-paystack";
import { cn } from "@/lib/utils";

export function SmsCreditsPanel({
  balance,
  welcomeOn,
  welcomeVisitorOn,
  canWrite,
  pricing,
  leaderMessagingOn = false,
}: {
  balance: number;
  welcomeOn: boolean;
  welcomeVisitorOn: boolean;
  canWrite: boolean;
  /** How this church buys credits: Ghana credits in cedis, or international credits shown in dollars. */
  pricing: SmsPricing;
  leaderMessagingOn?: boolean;
}) {
  const { run, toast } = useFeedback();
  const { start } = usePaystack();
  const router = useRouter();
  const [busyBundle, setBusyBundle] = useState<string | null>(null);
  const intl = pricing.kind === "intl";
  const bundles = pricing.bundles;
  const rate = pricing.rate;
  // Churches outside Ghana see dollars (Paystack still charges the cedi amount); Ghana churches see cedis.
  const money = (ghs: number) =>
    pricing.kind === "intl" ? `$${ghsToUsd(ghs, pricing.usdRate).toFixed(2)}` : `₵${ghs.toFixed(2)}`;
  // The two boxes stay in step: type credits to see the price, or type a price to see the credits.
  const [creditsText, setCreditsText] = useState("");
  const [amountText, setAmountText] = useState("");
  const customCredits = Math.floor(Number(creditsText) || 0);
  const customPrice = pricingPrice(customCredits, pricing);
  const customOk = customCredits >= pricing.min && customCredits <= pricing.max;

  async function buyCustom() {
    setBusyBundle("custom");
    try {
      const init = await buyCustomSmsCredits({ credits: customCredits });
      if ("error" in init && init.error) { toast(String(init.error), "error"); return; }
      await start(init, {
        onSuccess: () => { toast("Payment received - your credits are on the way.", "success"); setCreditsText(""); setAmountText(""); router.refresh(); },
        onError: (m) => toast(m, "error"),
      });
    } finally {
      setBusyBundle(null);
    }
  }

  async function buy(bundleId: string) {
    setBusyBundle(bundleId);
    try {
      const init = await buySmsCredits(bundleId);
      await start(init, {
        onSuccess: () => {
          toast("Payment received - your credits are on the way.", "success");
          router.refresh();
        },
        onError: (m) => toast(m, "error"),
      });
    } finally {
      setBusyBundle(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Balance */}
      <Card className="flex items-center justify-between p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
            <MessageSquare className="size-6" />
          </span>
          <div>
            <div className="text-sm text-ink-muted">SMS credit balance</div>
            <div className="font-display text-3xl font-bold tracking-tight">{balance.toLocaleString()}</div>
          </div>
        </div>
        <div className="text-right text-xs text-ink-faint">
          1 credit = 1 SMS<br />(per 160 characters, per recipient)<br />
          {pricing.kind === "intl"
            ? <span className="font-medium text-ink-muted">{money(rate)} per credit, to any number</span>
            : <span className="font-medium text-ink-muted">₵100 buys {pricingCredits(100, pricing).toLocaleString()} credits</span>}
        </div>
      </Card>

      {pricing.kind === "ghana" && (
        <div className="rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-xs text-ink-muted">
          <b className="text-ink">Members with numbers outside Ghana:</b> a text to a number outside Ghana uses{" "}
          <b className="text-ink">{pricing.foreignPerSegment} credits</b> per SMS (₵{pricing.intlPriceGhs.toFixed(2)}), because the network charges much more to send abroad.
          You see the exact count before anything is sent.
        </div>
      )}

      {balance <= (intl ? 3 : 20) && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Your SMS credits are running low. Top up below so your messages keep sending.
        </div>
      )}

      {/* Bundles */}
      <div>
        <h3 className="mb-3 font-display text-lg font-semibold">Buy SMS credits</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bundles.map((b) => (
            <Card key={b.id} className={cn("relative flex flex-col p-5", b.popular && "overflow-visible border-primary/40 ring-1 ring-primary/20")}>
              {b.popular && (
                <span className="absolute -top-2 right-4 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                  Popular
                </span>
              )}
              <div className="font-display text-2xl font-bold">{b.credits.toLocaleString()}</div>
              <div className="text-xs text-ink-faint">credits</div>
              <div className="mt-3 text-lg font-semibold text-ink">{money(b.priceGhs)}</div>
              <div className="text-xs text-ink-faint">{intl ? `${money(b.priceGhs / b.credits)} / SMS · charged as ₵${b.priceGhs.toFixed(2)}` : `≈ ₵${(b.priceGhs / b.credits).toFixed(3)} / SMS`}</div>
              <Button
                onClick={() => buy(b.id)}
                disabled={!canWrite || busyBundle !== null}
                className="mt-4 w-full"
                size="sm"
              >
                {busyBundle === b.id ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" /> Starting…</> : "Buy"}
              </Button>
            </Card>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Secure payment via Paystack (Mobile Money or card). Credits never expire.
          {intl && " Prices are shown in dollars; Paystack charges the amount in Ghana cedis, and your bank converts it."}
        </p>
      </div>

      {/* Any amount */}
      <Card className="p-5">
        <h3 className="font-display text-[1rem] font-semibold">Buy any amount</h3>
        <p className="mt-0.5 text-xs text-ink-muted">
          {intl ? `Type how many credits you want. Every credit costs ${money(rate)}.` : `Type how many credits you want, or how much you want to spend. Every credit costs ₵${rate.toFixed(2)}.`}
        </p>
        <div className={cn("mt-3 grid gap-3 sm:items-end", intl ? "sm:grid-cols-[1fr_auto]" : "sm:grid-cols-[1fr_1fr_auto]")}>
          <label className="text-xs font-medium text-ink-muted">Credits
            <Input
              inputMode="numeric" placeholder={`e.g. ${intl ? 40 : 3000} (minimum ${pricing.min})`} value={creditsText} disabled={!canWrite}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, "");
                setCreditsText(v);
                setAmountText(v ? pricingPrice(Number(v), pricing).toFixed(2) : "");
              }}
              className="mt-1"
            />
          </label>
          {!intl && <label className="text-xs font-medium text-ink-muted">You pay (₵)
            <Input
              inputMode="decimal" placeholder="e.g. 300" value={amountText} disabled={!canWrite}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                setAmountText(v);
                setCreditsText(v ? String(pricingCredits(Number(v), pricing)) : "");
              }}
              className="mt-1"
            />
          </label>}
          <Button onClick={buyCustom} disabled={!canWrite || !customOk || busyBundle !== null}>
            {busyBundle === "custom" ? <><Loader2 className="mr-1.5 size-4 animate-spin" /> Starting…</> : customOk ? `Buy ${customCredits.toLocaleString()} for ${money(customPrice)}` : "Buy"}
          </Button>
        </div>
        {customCredits > 0 && !customOk && (
          <p className="mt-2 text-xs text-warning">{customCredits < pricing.min ? `The smallest purchase is ${pricing.min} credits (${money(pricing.min * rate)}).` : `The largest single purchase is ${pricing.max.toLocaleString()} credits.`}</p>
        )}
      </Card>

      {/* Welcome SMS toggle */}
      <Card className="flex items-center justify-between p-5">
        <div className="pr-4">
          <div className="text-sm font-semibold text-ink">Welcome SMS on registration</div>
          <p className="text-xs text-ink-muted">
            Automatically text a warm welcome to members who register via your join link. Uses 1 credit each.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={welcomeOn}
          disabled={!canWrite}
          onClick={() =>
            run(() => setWelcomeSms(!welcomeOn), {
              pending: "Saving…",
              success: welcomeOn ? "Welcome SMS off" : "Welcome SMS on",
            })
          }
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full border border-line transition-colors disabled:opacity-50",
            welcomeOn ? "bg-primary" : "bg-surface-2",
          )}
        >
          <span className={cn("absolute top-0.5 grid size-4 place-items-center rounded-full bg-white transition-all", welcomeOn ? "left-[1.45rem]" : "left-0.5")}>
            {welcomeOn && <Check className="size-3 text-primary" />}
          </span>
        </button>
      </Card>

      {/* Welcome SMS toggle - visitors */}
      <Card className="flex items-center justify-between p-5">
        <div className="pr-4">
          <div className="text-sm font-semibold text-ink">Welcome SMS to visitors</div>
          <p className="text-xs text-ink-muted">
            Automatically text first-time visitors who fill in your visit link themselves. Uses 1 credit each. Edit the wording from Reminders &amp; automations.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={welcomeVisitorOn}
          disabled={!canWrite}
          onClick={() =>
            run(() => setWelcomeVisitorSms(!welcomeVisitorOn), {
              pending: "Saving…",
              success: welcomeVisitorOn ? "Welcome SMS off" : "Welcome SMS on",
            })
          }
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full border border-line transition-colors disabled:opacity-50",
            welcomeVisitorOn ? "bg-primary" : "bg-surface-2",
          )}
        >
          <span className={cn("absolute top-0.5 grid size-4 place-items-center rounded-full bg-white transition-all", welcomeVisitorOn ? "left-[1.45rem]" : "left-0.5")}>
            {welcomeVisitorOn && <Check className="size-3 text-primary" />}
          </span>
        </button>
      </Card>

      {/* Group leaders texting their own group */}
      <Card className="flex items-center justify-between p-5">
        <div className="pr-4">
          <div className="text-sm font-semibold text-ink">Let group leaders message their own group</div>
          <p className="text-xs text-ink-muted">
            The leader of a cell, ministry or committee can text just their group. It goes out from your church&apos;s sender ID, starts with the group&apos;s name and ends with the leader&apos;s name, so members know who is checking on them. It uses your credits, and a leader can send 3 a day per group. They need access to the Groups page and must be set as the group&apos;s leader.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={leaderMessagingOn}
          disabled={!canWrite}
          onClick={() => run(() => setLeaderMessaging(!leaderMessagingOn), { pending: "Saving…", success: leaderMessagingOn ? "Leaders can no longer message" : "Leaders can message their groups" })}
          className={cn("relative h-6 w-11 shrink-0 rounded-full border border-line transition-colors disabled:opacity-50", leaderMessagingOn ? "bg-primary" : "bg-surface-2")}
        >
          <span className={cn("absolute top-0.5 grid size-4 place-items-center rounded-full bg-white transition-all", leaderMessagingOn ? "left-[1.45rem]" : "left-0.5")}>
            {leaderMessagingOn && <Check className="size-3 text-primary" />}
          </span>
        </button>
      </Card>
    </div>
  );
}
