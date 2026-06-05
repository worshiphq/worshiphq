import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  prefix,
  suffix,
  decimals,
  change,
  icon: Icon,
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  change?: number;
  icon?: LucideIcon;
}) {
  const up = (change ?? 0) >= 0;
  return (
    <div className="card-surface group relative p-5 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between">
        <span className="text-sm text-ink-muted">{label}</span>
        {Icon && (
          <span className="grid size-9 place-items-center rounded-lg border border-line bg-surface-2 text-primary-bright">
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div className="mt-3 font-display text-3xl font-bold tracking-tight">
        <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </div>
      {change !== undefined && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
              up ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
            )}
          >
            {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {Math.abs(change)}%
          </span>
          <span className="text-ink-faint">vs last month</span>
        </div>
      )}
    </div>
  );
}
