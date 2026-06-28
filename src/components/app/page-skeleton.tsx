const shimmerClass = "relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:animate-[shimmer_2s_linear_infinite] before:bg-[length:200%_100%]";

function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-muted/40 ${shimmerClass} ${className}`} />;
}

export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Bar className="h-7 w-40" />
          <Bar className="h-4 w-56 mt-2" />
        </div>
        <Bar className="h-9 w-28 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-4">
            <Bar className="h-3 w-20 mb-2" />
            <Bar className="h-6 w-16" />
          </div>
        ))}
      </div>
      <Bar className="h-9 w-full max-w-sm rounded-lg" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
            <div className={`h-10 w-10 rounded-full bg-muted/40 shrink-0 ${shimmerClass}`} />
            <div className="flex-1 space-y-2">
              <Bar className="h-4 w-36" />
              <Bar className="h-3 w-24" />
            </div>
            <Bar className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinanceSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Bar className="h-7 w-36" />
        <Bar className="h-9 w-32 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-4">
            <Bar className="h-3 w-20 mb-2" />
            <Bar className="h-6 w-24" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-line last:border-0">
            <div className="space-y-1">
              <Bar className="h-4 w-48" />
              <Bar className="h-3 w-20" />
            </div>
            <Bar className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
