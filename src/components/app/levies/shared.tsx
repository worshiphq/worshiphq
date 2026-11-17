"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import type { LevyStatus } from "@/lib/levies/types";

/** "GH₵1,240.00" */
export const ghs = (n: number) => `${n < 0 ? "-" : ""}GH₵${Math.abs(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "GH₵1,240" for big headline numbers. */
export const ghs0 = (n: number) => `${n < 0 ? "-" : ""}GH₵${Math.abs(n).toLocaleString("en-GH", { maximumFractionDigits: 0 })}`;

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dayMonth = (ymd: string) => `${Number(ymd.slice(8, 10))} ${SHORT[Number(ymd.slice(5, 7)) - 1]}`;
export const dayMonthYear = (ymd: string) => `${dayMonth(ymd)} ${ymd.slice(0, 4)}`;

export const inputCls =
  "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30";
export const selectCls = inputCls;
export const labelCls = "mb-1.5 block text-sm font-medium text-ink-muted";

const TONE: Record<LevyStatus, string> = {
  counting: "border-info/30 bg-info/10 text-info",
  nothing_due: "border-line bg-surface-2 text-ink-muted",
  waived: "border-line bg-surface-2 text-ink-muted",
  paid: "border-success/30 bg-success/10 text-success",
  credit: "border-success/30 bg-success/10 text-success",
  part_paid: "border-warning/30 bg-warning/10 text-warning",
  overdue: "border-danger/30 bg-danger/10 text-danger",
  unpaid: "border-warning/30 bg-warning/10 text-warning",
};
export const STATUS_DOT: Record<LevyStatus | "none", string> = {
  counting: "bg-info", nothing_due: "bg-ink-faint/40", waived: "bg-ink-faint/40", paid: "bg-success", credit: "bg-success",
  part_paid: "bg-warning", overdue: "bg-danger", unpaid: "bg-warning/70", none: "bg-surface-2",
};

export function StatusBadge({ status, text, closed }: { status: LevyStatus; text: string; closed?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold", TONE[status])}>
      {closed && <Lock className="size-3" aria-label="Closed" />}
      {text}
    </span>
  );
}

/**
 * Run a server action that returns { ok, error }: shows a spinner on the button that started it, a toast with the
 * outcome, and refreshes the page data on success.
 */
export function useLevyAction() {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success?: string | ((r: Record<string, unknown>) => string), after?: () => void) =>
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) { toast(r.error, "error"); return; }
        const msg = typeof success === "function" ? success(r as unknown as Record<string, unknown>) : success;
        if (msg) toast(msg, "success");
        after?.();
        router.refresh();
      } catch (e) {
        toast((e as Error)?.message || "Something went wrong. Please try again.", "error");
      }
    });
  return { pending, run };
}

/** A button that shows a spinner and its own "doing it" words while busy. */
export function BusyButton({ busy, busyLabel, children, disabled, ...props }: ButtonProps & { busy: boolean; busyLabel: string }) {
  return (
    <Button {...props} disabled={busy || disabled} aria-busy={busy}>
      {busy ? <><Spinner size="sm" /> {busyLabel}</> : children}
    </Button>
  );
}

export function Empty({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <div className="font-display text-lg font-semibold">{title}</div>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{text}</p>
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export const FREQ_LABEL = { monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" } as const;
export const MONTH_OPTIONS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
