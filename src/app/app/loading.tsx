import { Wave } from "@/components/ui/wave";

export default function AppLoading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex flex-col items-center gap-4">
        <Wave className="size-10 text-primary-bright" />
        <p className="text-sm font-medium text-ink-muted">Loading…</p>
      </div>
    </div>
  );
}
