import { cn } from "../../lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  color = "text-primary-bright",
  prefix,
  suffix,
  trend,
}: {
  label: string;
  value: number | string;
  icon: any;
  color?: string;
  prefix?: string;
  suffix?: string;
  trend?: number;
}) {
  return (
    <div className="card group relative p-5 transition-colors hover:border-primary/30 animate-fade-up">
      <div className="flex items-start justify-between">
        <span className="text-sm text-ink-muted">{label}</span>
        <span className={cn("grid size-9 place-items-center rounded-lg border border-line bg-surface-2", color)}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        {prefix && <span className="text-sm text-ink-muted">{prefix}</span>}
        <span className="text-3xl font-bold tracking-tight text-ink stat-value" style={{ fontFamily: "'Plus Jakarta Sans', var(--font-display, sans-serif)" }}>{value}</span>
        {suffix && <span className="text-sm text-ink-muted">{suffix}</span>}
      </div>
      {trend !== undefined && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
            trend > 0 ? "bg-success/10 text-success" : trend < 0 ? "bg-danger/10 text-danger" : "bg-surface-2 text-ink-faint"
          )}>
            {trend > 0 ? "↑" : trend < 0 ? "↓" : "→"} {Math.abs(trend)}%
          </span>
          <span className="text-ink-faint">vs last month</span>
        </div>
      )}
    </div>
  );
}
