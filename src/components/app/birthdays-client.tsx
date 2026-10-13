"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MemberAvatar } from "@/components/ui/member-avatar";
import { Search, Cake, Heart, PartyPopper, ChevronLeft, ChevronRight, ArrowLeft, CalendarDays, List } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  name: string;
  phone: string | null;
  photoUrl: string | null;
  birthday: string | null;
  anniversary: string | null;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PAGE = 24;

function parseMMDD(mmdd: string): { month: number; day: number } {
  const [m, d] = mmdd.split("-").map(Number);
  return { month: m, day: d };
}

function daysUntil(mmdd: string, today: string): number {
  const { month: tm, day: td } = parseMMDD(today);
  const { month: m, day: d } = parseMMDD(mmdd);
  const thisYear = new Date().getFullYear();

  let target = new Date(thisYear, m - 1, d);
  const todayDate = new Date(thisYear, tm - 1, td);

  if (target < todayDate) {
    target = new Date(thisYear + 1, m - 1, d);
  }

  return Math.round((target.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(mmdd: string): string {
  const { month, day } = parseMMDD(mmdd);
  const d = new Date(2000, month - 1, day);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

type Kind = "all" | "birthday" | "anniversary";

export function BirthdaysClient({ items, today }: { items: Item[]; today: string }) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"upcoming" | "all" | "today">("upcoming");
  // "All" opens on the months overview; you can switch to a plain A-Z list.
  const [allMode, setAllMode] = useState<"months" | "list">("months");
  const [month, setMonth] = useState<number | null>(null); // 1-12, when a month is opened
  const [kind, setKind] = useState<Kind>("all");
  const [page, setPage] = useState(0);
  const thisMonth = parseMMDD(today).month;

  const enriched = useMemo(() => {
    return items
      .map((item) => {
        const bdayDays = item.birthday ? daysUntil(item.birthday, today) : null;
        const annivDays = item.anniversary ? daysUntil(item.anniversary, today) : null;
        const nearestDays = Math.min(bdayDays ?? 999, annivDays ?? 999);
        return { ...item, bdayDays, annivDays, nearestDays };
      })
      .sort((a, b) => a.nearestDays - b.nearestDays);
  }, [items, today]);

  // Per-month counts for the overview.
  const perMonth = useMemo(() => {
    const out = Array.from({ length: 12 }, () => ({ birthdays: 0, anniversaries: 0 }));
    for (const i of items) {
      if (i.birthday) out[parseMMDD(i.birthday).month - 1].birthdays++;
      if (i.anniversary) out[parseMMDD(i.anniversary).month - 1].anniversaries++;
    }
    return out;
  }, [items]);

  const matchesKind = (i: (typeof enriched)[number]) =>
    kind === "all" || (kind === "birthday" ? !!i.birthday : !!i.anniversary);

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;

  const todayCount = enriched.filter((i) => i.nearestDays === 0).length;

  // The rows shown for the current screen (months overview shows cards instead).
  const rows = useMemo(() => {
    let list = enriched.filter(matchesKind);
    if (searching) {
      list = list.filter((i) => i.name.toLowerCase().includes(q));
      return { list: list.slice(0, 60), total: list.length, mode: "search" as const };
    }
    if (view === "today") return { list: list.filter((i) => i.nearestDays === 0), total: 0, mode: "plain" as const };
    if (view === "upcoming") return { list: list.filter((i) => i.nearestDays <= 30), total: 0, mode: "plain" as const };
    if (month != null) {
      const inMonth = list
        .filter((i) => (kind !== "anniversary" && i.birthday && parseMMDD(i.birthday).month === month) || (kind !== "birthday" && i.anniversary && parseMMDD(i.anniversary).month === month))
        .sort((a, b) => {
          const da = Math.min(a.birthday && parseMMDD(a.birthday).month === month ? parseMMDD(a.birthday).day : 99, a.anniversary && parseMMDD(a.anniversary).month === month ? parseMMDD(a.anniversary).day : 99);
          const db = Math.min(b.birthday && parseMMDD(b.birthday).month === month ? parseMMDD(b.birthday).day : 99, b.anniversary && parseMMDD(b.anniversary).month === month ? parseMMDD(b.anniversary).day : 99);
          return da - db || a.name.localeCompare(b.name);
        });
      return { list: inMonth, total: inMonth.length, mode: "month" as const };
    }
    const az = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return { list: az, total: az.length, mode: "az" as const };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched, kind, q, searching, view, month]);

  const pages = Math.max(1, Math.ceil(rows.list.length / PAGE));
  const safePage = Math.min(page, pages - 1);
  const visible = rows.mode === "az" ? rows.list.slice(safePage * PAGE, safePage * PAGE + PAGE) : rows.list;

  const goView = (v: typeof view) => { setView(v); setMonth(null); setPage(0); };

  const showMonths = !searching && view === "all" && allMode === "months" && month == null;

  const dayOf = (item: (typeof enriched)[number], m: number) => {
    const b = item.birthday && parseMMDD(item.birthday).month === m ? parseMMDD(item.birthday).day : null;
    const a = item.anniversary && parseMMDD(item.anniversary).month === m ? parseMMDD(item.anniversary).day : null;
    return { b, a };
  };

  return (
    <div className="mt-5 space-y-4">
      {todayCount > 0 && (
        <Card className="flex items-center gap-3 bg-brand/5 p-4">
          <PartyPopper className="size-5 text-brand" />
          <span className="text-sm font-medium">
            {todayCount} member{todayCount !== 1 ? "s" : ""} celebrating today!
          </span>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            placeholder="Search members..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1">
          {(["today", "upcoming", "all"] as const).map((v) => (
            <Button key={v} variant={view === v ? "primary" : "secondary"} size="sm" onClick={() => goView(v)}>
              {v === "today" ? `Today (${todayCount})` : v === "upcoming" ? "Next 30 days" : "All"}
            </Button>
          ))}
        </div>
      </div>

      {/* Second row: what to show, and how to lay out "All" */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {([["all", "Everything"], ["birthday", "Birthdays"], ["anniversary", "Anniversaries"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => { setKind(k); setPage(0); }}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", kind === k ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "all" && !searching && (
          <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
            <button
              onClick={() => { setAllMode("months"); setMonth(null); setPage(0); }}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", allMode === "months" ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}
            >
              <CalendarDays className="size-3.5" /> By month
            </button>
            <button
              onClick={() => { setAllMode("list"); setMonth(null); setPage(0); }}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", allMode === "list" ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}
            >
              <List className="size-3.5" /> A to Z list
            </button>
          </div>
        )}
      </div>

      {/* ── Months overview ── */}
      {showMonths && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {MONTHS.map((name, i) => {
            const c = perMonth[i];
            const n = kind === "birthday" ? c.birthdays : kind === "anniversary" ? c.anniversaries : c.birthdays + c.anniversaries;
            const current = i + 1 === thisMonth;
            return (
              <button
                key={name}
                onClick={() => { setMonth(i + 1); setPage(0); }}
                disabled={n === 0}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-all",
                  current ? "border-primary/50 bg-primary/5" : "border-line bg-surface hover:border-primary/30 hover:shadow-sm",
                  n === 0 && "cursor-default opacity-50 hover:border-line hover:shadow-none",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-semibold">{name}</span>
                  {current && <Badge variant="default" className="text-[10px]">This month</Badge>}
                </div>
                <div className="mt-2 font-display text-2xl font-bold">{n}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-muted">
                  {kind !== "anniversary" && <span className="flex items-center gap-1"><Cake className="size-3" /> {c.birthdays}</span>}
                  {kind !== "birthday" && <span className="flex items-center gap-1"><Heart className="size-3" /> {c.anniversaries}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── One month, day by day ── */}
      {!searching && view === "all" && month != null && (
        <div className="flex items-center justify-between">
          <button onClick={() => setMonth(null)} className="flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
            <ArrowLeft className="size-4" /> All months
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => setMonth(month === 1 ? 12 : month - 1)} className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2" aria-label="Previous month"><ChevronLeft className="size-4" /></button>
            <span className="min-w-28 text-center font-display text-sm font-semibold">{MONTHS[month - 1]}</span>
            <button onClick={() => setMonth(month === 12 ? 1 : month + 1)} className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2" aria-label="Next month"><ChevronRight className="size-4" /></button>
          </div>
        </div>
      )}

      {!showMonths && (
        rows.list.length === 0 ? (
          <Card className="p-12 text-center">
            <Cake className="mx-auto size-10 text-ink-faint" />
            <p className="mt-3 text-sm text-ink-muted">
              {view === "today" && !searching
                ? "No birthdays or anniversaries today."
                : searching
                  ? "No members match your search."
                  : month != null
                    ? `Nothing in ${MONTHS[month - 1]}.`
                    : "No upcoming celebrations. Add birthday/anniversary info to member profiles."}
            </p>
          </Card>
        ) : (
          <>
            {searching && rows.total > rows.list.length && (
              <p className="text-xs text-ink-faint">Showing the first {rows.list.length} of {rows.total} matches. Type more of the name to narrow it down.</p>
            )}
            <div className="space-y-1">
              {visible.map((item) => {
                const dm = rows.mode === "month" && month != null ? dayOf(item, month) : null;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${item.nearestDays === 0 ? "bg-brand/5" : "hover:bg-surface-2"}`}
                  >
                    {dm && (
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-center font-display text-sm font-bold leading-none">
                        {dm.b ?? dm.a}
                      </div>
                    )}
                    <MemberAvatar name={item.name} photoUrl={item.photoUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-muted">
                        {item.birthday && kind !== "anniversary" && (
                          <span className="flex items-center gap-1">
                            <Cake className="size-3" />
                            {formatDate(item.birthday)}
                            {item.bdayDays === 0 && <Badge variant="default" className="ml-1 bg-brand/10 text-brand text-[10px]">Today!</Badge>}
                            {item.bdayDays !== null && item.bdayDays > 0 && item.bdayDays <= 7 && <span className="font-medium text-brand">in {item.bdayDays}d</span>}
                          </span>
                        )}
                        {item.anniversary && kind !== "birthday" && (
                          <span className="flex items-center gap-1">
                            <Heart className="size-3" />
                            {formatDate(item.anniversary)}
                            {item.annivDays === 0 && <Badge variant="default" className="ml-1 bg-success/10 text-success text-[10px]">Today!</Badge>}
                            {item.annivDays !== null && item.annivDays > 0 && item.annivDays <= 7 && <span className="font-medium text-success">in {item.annivDays}d</span>}
                          </span>
                        )}
                      </div>
                    </div>
                    {item.phone && <span className="hidden text-xs text-ink-faint sm:block">{item.phone}</span>}
                  </div>
                );
              })}
            </div>

            {rows.mode === "az" && pages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-ink-faint">
                  {safePage * PAGE + 1}-{Math.min(rows.list.length, (safePage + 1) * PAGE)} of {rows.list.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="secondary" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft className="size-4" /> Prev</Button>
                  <span className="px-2 text-xs text-ink-muted">Page {safePage + 1} / {pages}</span>
                  <Button size="sm" variant="secondary" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>Next <ChevronRight className="size-4" /></Button>
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
