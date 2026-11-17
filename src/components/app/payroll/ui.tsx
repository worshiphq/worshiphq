"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Check, Lock, ShieldCheck, Undo2, ChevronRight } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** "GHS 1,234.50": the app's money format, so the hide-amounts eye blurs it. */
export function ghs(n: number): string {
  const neg = n < 0;
  const [w, f] = Math.abs(Math.round(n * 100) / 100).toFixed(2).split(".");
  return `${neg ? "-" : ""}GHS ${w.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${f}`;
}

export function fmtDay(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
}

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "border-line bg-surface-2 text-ink-muted" },
  review: { label: "Waiting for approval", cls: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  approved: { label: "Approved", cls: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  paid: { label: "Paid", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  reversed: { label: "Reversed", cls: "border-danger/30 bg-danger/10 text-danger" },
};

export function RunStatusChip({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? STATUS.draft;
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", s.cls, className)}>{s.label}</span>;
}

export function SelfApprovedBadge() {
  return (
    <span title="Only one person manages payroll, so they approved their own payroll." className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
      <ShieldCheck className="size-3" /> Self-approved
    </span>
  );
}

const STEPS = [
  { key: "draft", label: "Draft" },
  { key: "review", label: "Approval" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
];

/** Draft, Approval, Approved, Paid. A reversed run shows the path it took, crossed out at the end. */
export function RunStepper({ status, people }: { status: string; people?: { preparedByName?: string | null; submittedByName?: string | null; approvedByName?: string | null; paidByName?: string | null } }) {
  const reversed = status === "reversed";
  const idx = reversed ? 3 : Math.max(0, STEPS.findIndex((s) => s.key === status));
  const who = [people?.preparedByName, people?.submittedByName, people?.approvedByName, people?.paidByName];
  return (
    <ol className="flex w-full items-start" aria-label="Payroll progress">
      {STEPS.map((s, i) => {
        const done = i < idx || (i === idx && (status === "paid" || reversed));
        const current = i === idx && !done;
        return (
          <li key={s.key} className="flex flex-1 flex-col items-center text-center last:flex-none sm:last:flex-1" aria-current={current ? "step" : undefined}>
            <div className="flex w-full items-center">
              <div className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : i <= idx ? (reversed ? "bg-danger/50" : "bg-primary") : "bg-line")} />
              <div className={cn(
                "grid size-9 shrink-0 place-items-center rounded-full border-2 text-sm font-bold transition-colors",
                done && !reversed && "border-primary bg-primary text-white",
                done && reversed && "border-danger/60 bg-danger/10 text-danger",
                current && "border-primary bg-surface text-primary ring-4 ring-primary/15",
                !done && !current && "border-line bg-surface text-ink-faint",
              )}>
                {done ? (reversed && i === 3 ? <Undo2 className="size-4" /> : <Check className="size-4" />) : i + 1}
              </div>
              <div className={cn("h-0.5 flex-1", i === STEPS.length - 1 ? "bg-transparent" : i < idx ? (reversed ? "bg-danger/50" : "bg-primary") : "bg-line")} />
            </div>
            <div className={cn("mt-2 text-xs font-semibold", current ? "text-primary" : done ? "text-ink" : "text-ink-faint")}>{reversed && i === 3 ? "Reversed" : s.label}</div>
            {who[i] && (done || current) && <div className="mt-0.5 hidden max-w-[9rem] truncate text-[11px] text-ink-faint sm:block">{who[i]}</div>}
          </li>
        );
      })}
    </ol>
  );
}

function TabInner({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return <>{pending ? <><Spinner size="sm" /> Opening…</> : label}</>;
}

/** Runs | Reports | Settings. */
export function PayrollTabs({ canManage }: { canManage: boolean }) {
  const path = usePathname() ?? "";
  const tabs = [
    { href: "/app/payroll", label: "Runs", active: path === "/app/payroll" || path.startsWith("/app/payroll/runs") },
    { href: "/app/payroll/reports", label: "Reports", active: path.startsWith("/app/payroll/reports") },
    ...(canManage ? [{ href: "/app/payroll/settings", label: "Settings", active: path.startsWith("/app/payroll/settings") }] : []),
  ];
  return (
    <nav aria-label="Payroll" className="mb-6 inline-flex flex-wrap gap-0.5 rounded-xl border border-line bg-surface-2 p-1 text-sm">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} prefetch={false} aria-current={t.active ? "page" : undefined}
          className={cn("inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-medium transition-colors", t.active ? "bg-primary text-white shadow-sm" : "text-ink-muted hover:text-ink")}>
          <TabInner label={t.label} />
        </Link>
      ))}
    </nav>
  );
}

function RowInner({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <>
      {children}
      <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-ink-faint">
        {pending ? <><Spinner size="sm" /> Opening…</> : <ChevronRight className="size-4" />}
      </span>
    </>
  );
}

/** A whole card or row that links somewhere and shows "Opening…" while the next page loads. */
export function RowLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} prefetch={false} className={cn("flex items-center gap-3", className)}>
      <RowInner>{children}</RowInner>
    </Link>
  );
}

/** Shown to WorshipHQ support (decision 2) and anyone else outside payroll. */
export function PrivateNotice({ title = "Private to the church", text = "Salaries and staff ID numbers are private. Only people the church's Main Admin chooses can open payroll." }: { title?: string; text?: string }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary"><Lock className="size-5" /></div>
      <h2 className="mt-4 font-display text-xl font-bold">{title}</h2>
      <p className="mt-2 text-sm text-ink-muted">{text}</p>
    </div>
  );
}

/** Small labelled figure for totals bars and cards. */
export function Figure({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={cn("mt-0.5 truncate tabular-nums", strong ? "font-display text-xl font-bold text-ink" : "text-sm font-semibold")}>{value}</div>
    </div>
  );
}

export function Initials({ name, photoUrl, size = "md" }: { name: string; photoUrl?: string | null; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "size-16 text-xl" : "size-11 text-sm";
  const init = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  // eslint-disable-next-line @next/next/no-img-element
  if (photoUrl) return <img src={photoUrl} alt="" className={cn(cls, "shrink-0 rounded-full object-cover")} />;
  return <div className={cn(cls, "grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 font-semibold text-primary")}>{init}</div>;
}

export const field = "flex h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink shadow-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

/** One tab in a link-based tab bar, with "Opening…" while the next tab loads. */
export function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href} prefetch={false} aria-current={active ? "page" : undefined}
      className={cn("inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-medium transition-colors", active ? "bg-primary text-white shadow-sm" : "text-ink-muted hover:text-ink")}>
      <TabInner label={label} />
    </Link>
  );
}
