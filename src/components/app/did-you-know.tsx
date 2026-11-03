"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lightbulb, X, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";

export type TipItem = { id: string; title: string; body: string; href: string; cta: string; kind: "usage" | "upsell" };

const KEY = "whq-tips-dismissed";
const OFF = "whq-tips-off";

/**
 * One "did you know" tip at a time, on the dashboard. Dismissing a tip hides it for good on this device,
 * "Next tip" cycles, and "Stop showing tips" turns the whole thing off. All of it lives in this browser's
 * storage, which is fine for a convenience: if storage is blocked the tips simply show again next visit.
 */
export function DidYouKnow({ tips }: { tips: TipItem[] }) {
  const [hidden, setHidden] = useState<string[] | null>(null);
  const [off, setOff] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    try {
      setOff(localStorage.getItem(OFF) === "1");
      setHidden(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
    } catch {
      setHidden([]);
    }
  }, []);

  const remaining = tips.filter((t) => !(hidden ?? []).includes(t.id));
  if (hidden === null || off || remaining.length === 0) return null;
  const tip = remaining[i % remaining.length];

  const dismiss = () => {
    const next = [...(hidden ?? []), tip.id];
    setHidden(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: it will show again */ }
  };
  const stop = () => {
    setOff(true);
    try { localStorage.setItem(OFF, "1"); } catch { /* ignore */ }
  };

  return (
    <Card className="relative border-gold/30 bg-gradient-to-br from-gold-soft to-surface p-4 sm:p-5">
      <button onClick={dismiss} aria-label="Dismiss this tip" className="absolute right-3 top-3 grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-surface-2 hover:text-ink">
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold"><Lightbulb className="size-4" /></span>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gold">{tip.kind === "upsell" ? "Worth knowing" : "Did you know?"}</div>
          <h3 className="font-display text-[1rem] font-semibold text-ink">{tip.title}</h3>
          <p className="mt-1 text-sm text-ink-muted">{tip.body}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <Link href={tip.href} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 font-semibold text-white hover:opacity-90" style={{ background: "var(--color-primary)", color: "#fff" }}>
              {tip.cta} <ChevronRight className="size-3.5" />
            </Link>
            {remaining.length > 1 && <button onClick={() => setI((n) => n + 1)} className="text-ink-muted hover:text-ink">Next tip ({remaining.length})</button>}
            <button onClick={stop} className="text-xs text-ink-faint hover:text-ink-muted">Stop showing tips</button>
          </div>
        </div>
      </div>
    </Card>
  );
}
