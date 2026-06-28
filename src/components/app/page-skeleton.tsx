export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-5 animate-pulse" style={{ animation: "fade-in 0.2s ease-out" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-40 rounded bg-muted/60" />
          <div className="h-4 w-56 rounded bg-muted/40 mt-2" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-muted/50" />
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-4">
            <div className="h-3 w-20 rounded bg-muted/40 mb-2" />
            <div className="h-6 w-16 rounded bg-muted/60" />
          </div>
        ))}
      </div>
      {/* Search bar */}
      <div className="h-9 w-full max-w-sm rounded-lg bg-muted/40" />
      {/* Rows */}
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
            <div className="h-10 w-10 rounded-full bg-muted/50 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-36 rounded bg-muted/50" />
              <div className="h-3 w-24 rounded bg-muted/30" />
            </div>
            <div className="h-5 w-14 rounded-full bg-muted/30" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinanceSkeleton() {
  return (
    <div className="space-y-5 animate-pulse" style={{ animation: "fade-in 0.2s ease-out" }}>
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 rounded bg-muted/60" />
        <div className="h-9 w-32 rounded-lg bg-muted/50" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-4">
            <div className="h-3 w-20 rounded bg-muted/40 mb-2" />
            <div className="h-6 w-24 rounded bg-muted/60" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-line last:border-0">
            <div className="space-y-1">
              <div className="h-4 w-48 rounded bg-muted/50" />
              <div className="h-3 w-20 rounded bg-muted/30" />
            </div>
            <div className="h-5 w-20 rounded bg-muted/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
