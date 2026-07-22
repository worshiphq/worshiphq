"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SMS_BUNDLES } from "@/config/sms";
import { buySmsCredits, setWelcomeSms } from "@/app/actions/sms-credits";
import { useFeedback } from "@/components/ui/feedback";
import { usePaystack } from "@/components/payments/use-paystack";
import { cn } from "@/lib/utils";

export function SmsCreditsPanel({
  balance,
  welcomeOn,
  canWrite,
}: {
  balance: number;
  welcomeOn: boolean;
  canWrite: boolean;
}) {
  const { run, toast } = useFeedback();
  const { start } = usePaystack();
  const router = useRouter();
  const [busyBundle, setBusyBundle] = useState<string | null>(null);

  async function buy(bundleId: string) {
    setBusyBundle(bundleId);
    try {
      const init = await buySmsCredits(bundleId);
      await start(init, {
        onSuccess: () => {
          toast("Payment received — your credits are on the way.", "success");
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
          1 credit = 1 SMS<br />(per 160 characters, per recipient)
        </div>
      </Card>

      {balance <= 20 && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Your SMS credits are running low. Top up below so your messages keep sending.
        </div>
      )}

      {/* Bundles */}
      <div>
        <h3 className="mb-3 font-display text-lg font-semibold">Buy SMS credits</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SMS_BUNDLES.map((b) => (
            <Card key={b.id} className={cn("relative flex flex-col p-5", b.popular && "overflow-visible border-primary/40 ring-1 ring-primary/20")}>
              {b.popular && (
                <span className="absolute -top-2 right-4 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                  Popular
                </span>
              )}
              <div className="font-display text-2xl font-bold">{b.credits.toLocaleString()}</div>
              <div className="text-xs text-ink-faint">credits</div>
              <div className="mt-3 text-lg font-semibold text-ink">₵{b.priceGhs}</div>
              <div className="text-xs text-ink-faint">≈ ₵{(b.priceGhs / b.credits).toFixed(3)} / SMS</div>
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
        <p className="mt-2 text-xs text-ink-faint">Secure payment via Paystack (Mobile Money or card). Credits never expire.</p>
      </div>

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
    </div>
  );
}
