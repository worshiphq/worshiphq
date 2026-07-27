"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Check, Loader2 } from "lucide-react";
import { SMS_TIERS, SMS_TIER_META, type SmsTier } from "@/config/sms";
import { setPlatformSmsTier } from "@/app/actions/admin";
import { cn } from "@/lib/utils";

const ORDER: SmsTier[] = ["B", "C", "D"];

export function SmsTierControl({ current }: { current: string }) {
  const [tier, setTier] = useState<SmsTier>((["B", "C", "D"].includes(current) ? current : "D") as SmsTier);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  function save(next: SmsTier) {
    setTier(next);
    setSaved(false);
    start(async () => {
      await setPlatformSmsTier(next);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-white" />
        <h2 className="font-semibold text-white">SMS pricing tier</h2>
        {pending && <Loader2 className="size-4 animate-spin text-white/50" />}
        {saved && <span className="flex items-center gap-1 text-xs text-teal-300"><Check className="size-3" /> Saved</span>}
      </div>
      <p className="mt-1 text-sm text-white/50">
        The site-wide default that applies to every church without an override. Change it any time — the buy page updates instantly.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {ORDER.map((t) => {
          const active = tier === t;
          const bundles = SMS_TIERS[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => save(t)}
              disabled={pending}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors disabled:opacity-60",
                active ? "border-teal-400/60 bg-teal-500/10" : "border-white/10 bg-white/[0.02] hover:border-white/25",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Tier {t} · {SMS_TIER_META[t].label}</span>
                {active && <Check className="size-4 text-teal-300" />}
              </div>
              <div className="mt-0.5 text-xs text-white/40">{SMS_TIER_META[t].note}</div>
              <div className="mt-3 space-y-1 text-xs text-white/60">
                {bundles.map((b) => (
                  <div key={b.id} className="flex justify-between">
                    <span>{b.credits.toLocaleString()}</span>
                    <span className="font-medium text-white/80">₵{b.priceGhs.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
