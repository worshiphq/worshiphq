"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, FileSpreadsheet, FileText, Package, Loader2, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ExportClient({
  datasets,
  canBundle,
  plan,
}: {
  datasets: { key: string; label: string }[];
  canBundle: boolean;
  plan: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  function download(url: string, id: string) {
    setBusy(id);
    // Let the browser handle the file; clear the spinner once it's kicked off.
    window.location.href = url;
    setTimeout(() => setBusy(null), 2500);
  }

  return (
    <div className="mt-5 space-y-6">
      {/* ── Everything at once ── */}
      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Package className="size-4" /> Download everything
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          One file containing every table you have access to — each on its own sheet.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => download("/api/export/all?format=xlsx", "all-xlsx")} disabled={busy !== null}>
            {busy === "all-xlsx" ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
            One big Excel file
          </Button>

          <Button
            variant="secondary"
            disabled={!canBundle || busy !== null}
            onClick={() => download("/api/export/all?format=zip", "all-zip")}
            title={canBundle ? undefined : "Available on Pro and Max"}
          >
            {busy === "all-zip" ? <Loader2 className="size-4 animate-spin" /> : canBundle ? <Package className="size-4" /> : <Lock className="size-4" />}
            Separate files (.zip)
          </Button>

          <Button
            variant="secondary"
            disabled={!canBundle || busy !== null}
            onClick={() => download("/api/export/all?format=zip&as=csv", "all-zip-csv")}
            title={canBundle ? undefined : "Available on Pro and Max"}
          >
            {busy === "all-zip-csv" ? <Loader2 className="size-4 animate-spin" /> : canBundle ? <FileText className="size-4" /> : <Lock className="size-4" />}
            Separate CSVs (.zip)
          </Button>
        </div>

        {!canBundle && (
          <p className="mt-3 rounded-lg border border-gold/30 bg-gold-soft px-3 py-2 text-xs text-gold">
            You&rsquo;re on <span className="font-semibold capitalize">{plan}</span>. The single combined Excel file is included on every plan.
            {" "}
            <Link href="/app/settings?tab=billing" className="font-semibold underline">Upgrade to Pro</Link>
            {" "}to also download each table as its own file in a zip.
          </p>
        )}
      </Card>

      {/* ── Per-table ── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold">Download a single table</h2>
        {datasets.length === 0 ? (
          <Card className="p-8 text-center text-sm text-ink-faint">
            You don&rsquo;t have access to any exportable sections.
          </Card>
        ) : (
          <div className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface">
            {datasets.map((d) => (
              <div key={d.key} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-medium">{d.label}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => download(`/api/export/${d.key}?format=xlsx`, `${d.key}-xlsx`)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium",
                      "text-ink-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    {busy === `${d.key}-xlsx` ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />}
                    Excel
                  </button>
                  <button
                    onClick={() => download(`/api/export/${d.key}?format=csv`, `${d.key}-csv`)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium",
                      "text-ink-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    {busy === `${d.key}-csv` ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
                    CSV
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-ink-faint">
          <Download className="mr-1 inline size-3" />
          CSV files can be edited and brought back in through Import.
        </p>
      </div>
    </div>
  );
}
