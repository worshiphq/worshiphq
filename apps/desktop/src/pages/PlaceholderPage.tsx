import { Construction } from "lucide-react";
import { PageShell } from "../components/PageShell";

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <PageShell title={title}>
      <div className="flex flex-col items-center justify-center py-24">
        <Construction className="size-12 text-ink-faint/30" />
        <h2 className="mt-4 text-lg font-bold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          This module is coming soon. Sync data from your WorshipHQ web dashboard.
        </p>
      </div>
    </PageShell>
  );
}
