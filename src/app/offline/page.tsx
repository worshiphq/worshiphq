import Link from "next/link";
import { CloudOff } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-base px-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-8 grid size-16 place-items-center rounded-2xl border border-line bg-surface text-primary-bright">
          <CloudOff className="size-7" />
        </div>
        <Logo className="mx-auto mb-6 justify-center" />
        <h1 className="text-3xl font-bold">You&rsquo;re offline</h1>
        <p className="mt-3 text-ink-muted">
          No internet right now — but WorshipHQ keeps your recently viewed data cached on this device.
          Reconnect to sync any changes you&rsquo;ve made.
        </p>
        <Link
          href="/app"
          className="mt-8 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-bright"
        >
          Try the dashboard
        </Link>
      </div>
    </main>
  );
}
