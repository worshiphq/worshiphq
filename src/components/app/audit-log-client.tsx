"use client";

import { useServerList } from "@/components/ui/use-server-list";
import { searchAudit } from "@/app/actions/lists";
import type { AuditFilters } from "@/lib/data/lists-a";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ScrollText, Plus, Pencil, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PERIODS, periodStart, filterSelectCls, Pager } from "@/components/app/list-filters";

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

export function AuditLogClient({ initial, options }: { initial: { rows: LogEntry[]; total: number; page: number }; options: { entities: string[]; actions: string[]; users: string[] } }) {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [period, setPeriod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const PAGE_SIZE = 30;

  const entities = options.entities;
  const actions = options.actions;
  const users = options.users;

  const since = from ? null : periodStart(period);
  const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : since;
  const toTs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;

  const list = useServerList<LogEntry, AuditFilters>({
    initial,
    query: search,
    filters: { entity: entityFilter, action: actionFilter, user: userFilter, fromMs: fromTs, toMs: toTs },
    fetchPage: searchAudit,
    pageSize: PAGE_SIZE,
  });
  const filtering = !!(search || entityFilter || actionFilter || userFilter || period || from || to);
  const reset = (fn: () => void) => { fn(); };

  return (
    <div className="mt-5 space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input placeholder="Search logs..." value={search} onChange={(e) => reset(() => setSearch(e.target.value))} className="pl-10 pr-10" />
            {list.spinner}
          </div>
          <select value={userFilter} onChange={(e) => reset(() => setUserFilter(e.target.value))} className={filterSelectCls} aria-label="Person">
            <option value="">Everyone</option>
            {users.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={actionFilter} onChange={(e) => reset(() => setActionFilter(e.target.value))} className={filterSelectCls} aria-label="Action">
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{(ACTION_META[a] ?? { label: a }).label}</option>)}
          </select>
          <select value={entityFilter} onChange={(e) => reset(() => setEntityFilter(e.target.value))} className={filterSelectCls} aria-label="What changed">
            <option value="">All areas</option>
            {entities.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={from || to ? "custom" : period} disabled={!!(from || to)} onChange={(e) => reset(() => setPeriod(e.target.value))} className={filterSelectCls} aria-label="Period">
            {(from || to) && <option value="custom">Custom dates</option>}
            {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <span className="text-xs text-ink-faint">or between</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => reset(() => setFrom(e.target.value))} className={filterSelectCls} aria-label="From date" />
          <span className="text-xs text-ink-faint">and</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => reset(() => setTo(e.target.value))} className={filterSelectCls} aria-label="To date" />
          {filtering && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setEntityFilter(""); setActionFilter(""); setUserFilter(""); setPeriod(""); setFrom(""); setTo(""); }}>
              Clear filters
            </Button>
          )}
          <span className="ml-auto text-xs text-ink-muted">{list.total} entr{list.total === 1 ? "y" : "ies"}</span>
        </div>
      </div>

      {list.rows.length === 0 ? (
        <Card className="p-12 text-center">
          <ScrollText className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {filtering ? "No logs match your filters." : "No audit logs yet. Actions will appear here as your team uses the app."}
          </p>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {list.rows.map((l) => {
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
      {list.pager}
    </div>
  );
}
