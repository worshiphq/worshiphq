"use client";

import { useEffect, useId } from "react";
import { X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { buttonVariants, type ButtonProps } from "@/components/ui/button";
import { formatCurrency } from "@/config/brand";

export const money = (n: number, decimals = false) => formatCurrency(n, { decimals });

export type Tone = "success" | "warning" | "danger" | "info" | "muted" | "primary";

const DOT: Record<Tone, string> = {
  success: "bg-success", warning: "bg-warning", danger: "bg-danger", info: "bg-info", muted: "bg-ink-faint", primary: "bg-primary",
};
const TEXT: Record<Tone, string> = {
  success: "text-success", warning: "text-warning", danger: "text-danger", info: "text-info", muted: "text-ink-muted", primary: "text-primary",
};

/** Status is never colour alone: a dot plus a word. */
export function Dot({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", TEXT[tone], className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}

/** A soft pill with a dot, for status columns. */
export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const ring: Record<Tone, string> = {
    success: "border-success/30 bg-success/10", warning: "border-warning/30 bg-warning/10", danger: "border-danger/30 bg-danger/10",
    info: "border-info/30 bg-info/10", muted: "border-line bg-surface-2", primary: "border-primary/30 bg-primary-soft/40",
  };
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5", ring[tone])}><Dot tone={tone}>{children}</Dot></span>;
}

/** A dialog on desktop and a bottom sheet on phones. */
export function Sheet({ open, onClose, title, description, wide, children, busy }: {
  open: boolean; onClose: () => void; title: string; description?: string; wide?: boolean; children: React.ReactNode; busy?: boolean;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || busy) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div
        role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-2xl border border-line bg-surface px-4 pb-6 pt-3 shadow-2xl animate-slide-up",
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6 sm:animate-fade-up",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-display text-xl font-bold">{title}</h2>
            {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} disabled={busy} className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 disabled:opacity-40">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/** A button that shows a spinner and a message while its work runs. */
export function BusyButton({ busy, busyLabel = "Saving…", children, className, variant, size, disabled, type = "submit", ...props }: ButtonProps & { busy: boolean; busyLabel?: string }) {
  return (
    <button type={type} disabled={busy || disabled} aria-busy={busy} className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {busy ? <><Spinner size="sm" /> {busyLabel}</> : children}
    </button>
  );
}

export function FormError({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
      <AlertCircle className="mt-0.5 size-4 shrink-0" /> <span>{error}</span>
    </p>
  );
}

/** A labelled section inside a long form. */
export function FormSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-line-soft pt-4 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export const inputCls = "flex h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-faint focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

export function F({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink-muted">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}

export function Select({ name, options, defaultValue, value, onChange, id, required, className }: {
  name?: string; options: { value: string; label: string }[]; defaultValue?: string; value?: string; onChange?: (v: string) => void; id?: string; required?: boolean; className?: string;
}) {
  return (
    <select id={id} name={name} required={required} defaultValue={value === undefined ? defaultValue : undefined} value={value} onChange={(e) => onChange?.(e.target.value)} className={cn(inputCls, "pr-8", className)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Chips you can tap: one choice, submitted through a hidden input. */
export function ChipChoice({ name, options, value, onChange, className }: { name?: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} role="radiogroup">
      {name && <input type="hidden" name={name} value={value} />}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition-colors", on ? "border-primary bg-primary text-white" : "border-line bg-surface text-ink-muted hover:border-primary/40 hover:text-ink")}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const todayYmd = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (iso: string | Date | null | undefined, withYear = true) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }) : "";
export const ymdOf = (iso: string | Date | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

export function ago(iso: string, now = Date.now()): string {
  const d = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "1 day";
  if (d < 60) return `${d} days`;
  return `${Math.floor(d / 30)} months`;
}
