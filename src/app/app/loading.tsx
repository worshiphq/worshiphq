import { CometSpinner } from "@/components/ui/comet-spinner";

export default function AppLoading() {
  return (
    <div className="grid min-h-[60vh] place-items-center" style={{ animation: "fade-in 0.3s ease-out 0.15s both" }}>
      <div className="flex flex-col items-center gap-4">
        <CometSpinner className="size-10 text-primary-bright" />
        <p className="text-sm font-medium text-ink-muted">Loading…</p>
      </div>
    </div>
  );
}
