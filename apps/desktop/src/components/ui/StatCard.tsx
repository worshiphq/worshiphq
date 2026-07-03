import { cn } from "../../lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  color = "bg-primary-soft text-primary-bright",
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
    <div className="card-hover animate-fade-up">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-muted">{label}</span>
        <span className={cn("grid size-9 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110", color)}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        {prefix && <span className="text-sm text-ink-muted">{prefix}</span>}
        <span className="text-2xl font-bold text-ink stat-value">{value}</span>
        {suffix && <span className="text-sm text-ink-muted">{suffix}</span>}
      </div>
      {trend !== undefined && (
        <div className={cn("mt-1 text-xs font-medium", trend >= 0 ? "text-success" : "text-danger")}>
          {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
}
