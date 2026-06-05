export default function AppLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-7 h-9 w-64 rounded-lg bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl border border-line bg-surface/40" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="h-72 rounded-2xl border border-line bg-surface/40 lg:col-span-2" />
        <div className="h-72 rounded-2xl border border-line bg-surface/40" />
      </div>
    </div>
  );
}
