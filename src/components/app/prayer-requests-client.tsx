"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Heart, CheckCircle2, Archive, Circle, Trash2, User, Calendar, Undo2, Loader2 } from "lucide-react";
import { updatePrayerRequestStatus, deletePrayerRequest, markPrayerRequestsPrayed } from "@/app/actions/prayer-requests";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";
import { PERIODS, periodStart, filterSelectCls, Pager } from "@/components/app/list-filters";
import { useFeedback } from "@/components/ui/feedback";
import { ExtraAnswers, asExtra, type ExtraAnswer } from "@/components/app/extra-answers";

type PrayerRow = {
  id: string;
  name: string;
  request: string;
  isAnonymous: boolean;
  status: string;
  prayedAt: string | null;
  prayedBy: string | null;
  extra: ExtraAnswer[] | null;
  createdAt: string;
};

type Tab = "active" | "prayed" | "archived" | "all";

const STATUS_META: Record<string, { icon: typeof Circle; label: string; color: string }> = {
  active: { icon: Circle, label: "New", color: "text-info" },
  prayed: { icon: CheckCircle2, label: "Prayed for", color: "text-success" },
  archived: { icon: Archive, label: "Archived", color: "text-ink-muted" },
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function PrayerRequestsClient({ items, prayUrl, canWrite }: { items: PrayerRow[]; prayUrl: string; canWrite: boolean }) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("active");
  const [period, setPeriod] = useState("");
  const [who, setWho] = useState<"" | "named" | "anonymous">("");
  const [sort, setSort] = useState<"new" | "old">("new");
  const [page, setPage] = useState(1);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const { toast } = useFeedback();
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
    active: base.filter((p) => p.status === "active").length,
    prayed: base.filter((p) => p.status === "prayed").length,
    archived: base.filter((p) => p.status === "archived").length,
    all: base.length,
  };
  const filtered = base
    .filter((p) => tab === "all" || p.status === tab)
    .sort((x, y) => (sort === "old" ? x.createdAt.localeCompare(y.createdAt) : y.createdAt.localeCompare(x.createdAt)));
  const cur = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const shown = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  const filtering = !!(search || period || who);

  const setStatus = (id: string, status: string) => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", status);
    start(() => updatePrayerRequestStatus(fd));
  };

  const markAll = () => {
    const ids = filtered.filter((p) => p.status === "active").map((p) => p.id);
    if (ids.length === 0) return;
    if (!window.confirm(`Mark ${ids.length} request${ids.length === 1 ? "" : "s"} as prayed for?`)) return;
    start(async () => {
      const res = await markPrayerRequestsPrayed(ids);
      toast(res.ok ? `${res.count} marked as prayed for` : "Could not update", res.ok ? "success" : "error");
    });
  };

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    if (!confirmBinDelete("Delete this prayer request?")) return;
    start(async () => { await deletePrayerRequest(fd); binDeleted(); });
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: "active", label: "New" },
    { key: "prayed", label: "Prayed for" },
    { key: "archived", label: "Archived" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="mt-5 space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input placeholder="Search prayer requests..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
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
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((t) => (
            <Button key={t.key} variant={tab === t.key ? "primary" : "secondary"} size="sm" onClick={() => { setTab(t.key); setPage(1); }}>
              {t.label}
              <span className={`ml-1 rounded-full px-1.5 text-[11px] font-semibold ${tab === t.key ? "bg-white/25" : "bg-surface-2 text-ink-faint"}`}>{counts[t.key]}</span>
            </Button>
          ))}
          {filtering && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setPeriod(""); setWho(""); setPage(1); }}>Clear filters</Button>}
          {canWrite && tab === "active" && counts.active > 0 && (
            <Button variant="secondary" size="sm" className="ml-auto" onClick={markAll} disabled={pending}>
              {pending ? <><Loader2 className="animate-spin" /> Updating…</> : <><CheckCircle2 /> Mark all as prayed for</>}
            </Button>
          )}
        </div>
      </div>

      {prayUrl && (
        <Card className="flex flex-wrap items-center gap-3 bg-brand/5 p-3">
          <Heart className="size-4 text-brand" />
          <span className="text-sm">Share this link for your congregation to submit prayer requests:</span>
          <code className="rounded bg-surface-raised px-2 py-1 text-xs">{prayUrl}</code>
          <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(prayUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </Card>
      )}

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Heart className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {filtering
              ? "No prayer requests match those filters."
              : tab === "active"
                ? "No new prayer requests. Everything has been prayed for."
                : tab === "prayed"
                  ? "Nothing has been marked as prayed for yet."
                  : "No prayer requests yet. Share your prayer link with the congregation."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {shown.map((p) => {
            const meta = STATUS_META[p.status] ?? STATUS_META.active;
            const Icon = meta.icon;
            return (
              <Card key={p.id} className={`p-4 ${pending ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3">
                  <Icon className={`mt-0.5 size-5 shrink-0 ${meta.color}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${p.status === "archived" ? "text-ink-muted" : ""}`}>{p.request}</p>
                    <ExtraAnswers items={p.extra} className="mt-2" />
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                      <span className="flex items-center gap-1"><User className="size-3" /> {p.isAnonymous ? "Anonymous" : p.name}</span>
                      <span className="flex items-center gap-1"><Calendar className="size-3" /> {fmt(p.createdAt)}</span>
                      <Badge variant="default" className="text-[10px]">{meta.label}</Badge>
                      {p.status === "prayed" && p.prayedAt && (
                        <span className="text-success">Prayed for {fmt(p.prayedAt)}{p.prayedBy ? ` by ${p.prayedBy}` : ""}</span>
                      )}
                    </div>
                  </div>

                  {canWrite && (
                    <div className="flex shrink-0 items-center gap-1">
                      {p.status === "active" && (
                        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setStatus(p.id, "prayed")}>
                          <CheckCircle2 /> Prayed for
                        </Button>
                      )}
                      {p.status !== "active" && (
                        <button onClick={() => setStatus(p.id, "active")} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-ink-muted hover:bg-surface-2" title="Move back to new">
                          <Undo2 className="size-3.5" /> Back to new
                        </button>
                      )}
                      {p.status !== "archived" && (
                        <button onClick={() => setStatus(p.id, "archived")} disabled={pending} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink" title="Archive">
                          <Archive className="size-4" />
                        </button>
                      )}
                      <button onClick={() => handleDelete(p.id)} disabled={pending} className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger" title="Delete">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
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
