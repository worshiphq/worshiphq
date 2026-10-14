"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Heart, CheckCircle2, Archive, Circle, Trash2, User, Calendar,
} from "lucide-react";
import {
  updatePrayerRequestStatus, incrementPrayerCount, deletePrayerRequest,
} from "@/app/actions/prayer-requests";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";
import { PERIODS, periodStart, filterSelectCls, Pager } from "@/components/app/list-filters";

type PrayerRow = {
  id: string;
  name: string;
  request: string;
  isAnonymous: boolean;
  status: string;
  prayerCount: number;
  createdAt: string;
};

const STATUS_META: Record<string, { icon: typeof Circle; label: string; color: string }> = {
  active: { icon: Circle, label: "Active", color: "text-info" },
  answered: { icon: CheckCircle2, label: "Answered", color: "text-success" },
  archived: { icon: Archive, label: "Archived", color: "text-ink-muted" },
};

export function PrayerRequestsClient({ items, prayUrl }: { items: PrayerRow[]; prayUrl: string }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "answered" | "archived">("all");
  const [period, setPeriod] = useState("");
  const [who, setWho] = useState<"" | "named" | "anonymous">("");
  const [sort, setSort] = useState<"new" | "old" | "prayed">("new");
  const [page, setPage] = useState(1);
  const [pending, start] = useTransition();
  const PAGE_SIZE = 20;

  const since = periodStart(period);
  const q = search.trim().toLowerCase();
  const base = items.filter((p) => {
    if (since !== null && new Date(p.createdAt).getTime() < since) return false;
    if (who === "anonymous" && !p.isAnonymous) return false;
    if (who === "named" && p.isAnonymous) return false;
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.request.toLowerCase().includes(q);
  });
  const counts = {
    all: base.length,
    active: base.filter((p) => p.status === "active").length,
    answered: base.filter((p) => p.status === "answered").length,
    archived: base.filter((p) => p.status === "archived").length,
  };
  const filtered = base
    .filter((p) => filter === "all" || p.status === filter)
    .sort((x, y) =>
      sort === "prayed" ? y.prayerCount - x.prayerCount || y.createdAt.localeCompare(x.createdAt)
        : sort === "old" ? x.createdAt.localeCompare(y.createdAt)
          : y.createdAt.localeCompare(x.createdAt));
  const cur = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const shown = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  const filtering = !!(search || period || who || filter !== "all");

  const handleStatus = (id: string, status: string) => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", status);
    start(() => updatePrayerRequestStatus(fd));
  };

  const handlePray = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => incrementPrayerCount(fd));
  };

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    if (!confirmBinDelete("Delete this prayer request?")) return;
    start(async () => { await deletePrayerRequest(fd); binDeleted(); });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(prayUrl);
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input
              placeholder="Search prayer requests..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-10"
            />
          </div>
          <select value={period} onChange={(e) => { setPeriod(e.target.value); setPage(1); }} className={filterSelectCls} aria-label="Period">
            {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <select value={who} onChange={(e) => { setWho(e.target.value as typeof who); setPage(1); }} className={filterSelectCls} aria-label="Who asked">
            <option value="">Named and anonymous</option>
            <option value="named">Named only</option>
            <option value="anonymous">Anonymous only</option>
          </select>
          <select value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }} className={filterSelectCls} aria-label="Sort">
            <option value="new">Newest first</option>
            <option value="old">Oldest first</option>
            <option value="prayed">Most prayed for</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {(["all", "active", "answered", "archived"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "primary" : "secondary"}
              size="sm"
              onClick={() => { setFilter(f); setPage(1); }}
            >
              {f === "all" ? "All" : STATUS_META[f].label}
              <span className={`ml-1 rounded-full px-1.5 text-[11px] font-semibold ${filter === f ? "bg-white/25" : "bg-surface-2 text-ink-faint"}`}>{counts[f]}</span>
            </Button>
          ))}
          {filtering && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setPeriod(""); setWho(""); setFilter("all"); setPage(1); }}>Clear filters</Button>
          )}
        </div>
      </div>

      {prayUrl && (
        <Card className="flex flex-wrap items-center gap-3 bg-brand/5 p-3">
          <Heart className="size-4 text-brand" />
          <span className="text-sm">Share this link for your congregation to submit prayer requests:</span>
          <code className="rounded bg-surface-raised px-2 py-1 text-xs">{prayUrl}</code>
          <Button size="sm" variant="secondary" onClick={copyLink}>Copy</Button>
        </Card>
      )}

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Heart className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {filtering ? "No prayer requests match those filters." : "No prayer requests yet. Share your prayer link with the congregation."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {shown.map((p) => {
            const statusMeta = STATUS_META[p.status] ?? STATUS_META.active;
            const StatusIcon = statusMeta.icon;

            return (
              <Card key={p.id} className={`p-4 ${pending ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3">
                  <button
                    onClick={() =>
                      handleStatus(p.id, p.status === "active" ? "answered" : p.status === "answered" ? "archived" : "active")
                    }
                    className="mt-0.5 shrink-0"
                    title={`Mark as ${p.status === "active" ? "answered" : p.status === "answered" ? "archived" : "active"}`}
                  >
                    <StatusIcon className={`size-5 ${statusMeta.color}`} />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${p.status === "archived" ? "text-ink-muted line-through" : ""}`}>
                      {p.request}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                      <span className="flex items-center gap-1">
                        <User className="size-3" />
                        {p.isAnonymous ? "Anonymous" : p.name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        {new Date(p.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      <Badge variant="default" className="text-[10px]">{statusMeta.label}</Badge>
                      {p.prayerCount > 0 && (
                        <span className="flex items-center gap-1 text-brand">
                          <Heart className="size-3 fill-brand" /> {p.prayerCount} prayed
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => handlePray(p.id)}
                      className="rounded-lg p-1.5 text-ink-faint hover:bg-brand/10 hover:text-brand"
                      title="I prayed for this"
                    >
                      <Heart className="size-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
                      title="Delete"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
          <Pager page={cur} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
