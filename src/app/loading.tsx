import { CometSpinner } from "@/components/ui/comet-spinner";

export default function RootLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-base" style={{ animation: "fade-in 0.3s ease-out 0.15s both" }}>
      <div className="flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo2.png" alt="" className="size-14 object-contain" />
        <CometSpinner className="size-8 text-primary-bright" />
        <p className="text-sm font-medium text-ink-muted">Loading…</p>
      </div>
    </div>
  );
}
