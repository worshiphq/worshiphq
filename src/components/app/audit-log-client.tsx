"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ScrollText, Plus, Pencil, Trash2, Eye } from "lucide-react";

type LogEntry = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: string | null;
  userName: string;
  userEmail: string;
  createdAt: string;
};

const ACTION_META: Record<string, { icon: typeof Plus; color: string; label: string }> = {
  create: { icon: Plus, color: "text-success", label: "Created" },
  update: { icon: Pencil, color: "text-brand", label: "Updated" },
  delete: { icon: Trash2, color: "text-danger", label: "Deleted" },
  view: { icon: Eye, color: "text-ink-muted", label: "Viewed" },
};

export function AuditLogClient({ logs }: { logs: LogEntry[] }) {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");

  const entities = [...new Set(logs.map((l) => l.entity))].sort();

  const filtered = logs.filter((l) => {
    if (entityFilter && l.entity !== entityFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.userName.toLowerCase().includes(q) ||
      l.detail?.toLowerCase().includes(q) ||
      l.entity.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="h-11 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
        >
          <option value="">All entities</option>
          {entities.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <ScrollText className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {search || entityFilter ? "No logs match your filter." : "No audit logs yet. Actions will appear here as your team uses the app."}
          </p>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((l) => {
            const meta = ACTION_META[l.action] ?? ACTION_META.view;
            const Icon = meta.icon;

            return (
              <Card key={l.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 ${meta.color}`}>
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{l.userName}</span>
                      <Badge variant="default" className="text-[10px]">
                        {meta.label} {l.entity}
                      </Badge>
                    </div>
                    {l.detail && (
                      <p className="mt-0.5 text-xs text-ink-muted">{l.detail}</p>
                    )}
                    <p className="mt-1 text-[11px] text-ink-faint">
                      {new Date(l.createdAt).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
