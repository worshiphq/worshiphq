"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export interface CampaignRow {
  id: string;
  name: string;
  channel: string;
  sent: number;
  delivered: number;
  opened: number;
  date: string;
  status: string;
}

const PER_PAGE = 10;

/** All campaigns are loaded once; paging happens in-memory (no reload). */
export function CampaignHistory({ campaigns }: { campaigns: CampaignRow[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(campaigns.length / PER_PAGE));
  const clamped = Math.min(page, pages - 1);
  const slice = campaigns.slice(clamped * PER_PAGE, clamped * PER_PAGE + PER_PAGE);

  return (
    <Card className="lg:col-span-3">
      <div className="flex items-center justify-between border-b border-line p-5">
        <h3 className="font-display text-lg font-semibold">Campaign history</h3>
        <Badge variant="default"><BarChart3 className="size-3" /> {campaigns.length} total</Badge>
      </div>
      {campaigns.length === 0 ? (
        <div className="p-10 text-center text-sm text-ink-muted">No broadcasts yet. Send your first from the composer.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <tr><th className="p-4 font-medium">Campaign</th><th className="p-4 font-medium">Channel</th><th className="p-4 font-medium">Delivered</th><th className="hidden p-4 font-medium sm:table-cell">Date</th><th className="p-4 font-medium">Status</th></tr>
              </thead>
              <tbody>
                {slice.map((c) => (
                  <tr key={c.id} className="border-b border-line-soft last:border-0">
                    <td className="p-4 font-medium">{c.name}</td>
                    <td className="p-4"><Badge variant={c.channel === "SMS" ? "primary" : "info"}>{c.channel}</Badge></td>
                    <td className="p-4 text-ink-muted">{c.sent > 0 ? `${c.delivered}/${c.sent}` : "—"}{c.channel === "Email" && c.opened > 0 && <span className="ml-1 text-xs text-ink-faint">({c.opened} opened)</span>}</td>
                    <td className="hidden p-4 text-ink-muted sm:table-cell">{formatDate(c.date)}</td>
                    <td className="p-4"><Badge variant={c.status === "Sent" ? "success" : "warning"}>{c.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
              <span className="text-ink-faint">
                {clamped * PER_PAGE + 1}–{Math.min((clamped + 1) * PER_PAGE, campaigns.length)} of {campaigns.length}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(clamped - 1)} disabled={clamped === 0}
                  className="grid size-8 place-items-center rounded-lg border border-line text-ink-muted hover:bg-surface-2 disabled:opacity-40">
                  <ChevronLeft className="size-4" />
                </button>
                <span className="px-2 text-xs text-ink-muted">Page {clamped + 1} / {pages}</span>
                <button onClick={() => setPage(clamped + 1)} disabled={clamped >= pages - 1}
                  className="grid size-8 place-items-center rounded-lg border border-line text-ink-muted hover:bg-surface-2 disabled:opacity-40">
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
