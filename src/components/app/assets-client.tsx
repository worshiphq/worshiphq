"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, Package, Music, Monitor, Bus, Utensils, Armchair, Cpu, HelpCircle, Plus, Printer, Download, SlidersHorizontal,
  LayoutList, LayoutGrid, AlertTriangle, MoreHorizontal, X, MapPin, UserRound, Tag,
} from "lucide-react";
import { useServerList } from "@/components/ui/use-server-list";
import { searchAssets, searchPickerPeople } from "@/app/actions/lists";
import { bulkUpdateAssets } from "@/app/actions/assets";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { PendingLink } from "@/components/ui/pending-link";
import { SearchSelect } from "@/components/app/search-select";
import { useFeedback } from "@/components/ui/feedback";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/app/page-header";
import { AssetForm, type AssetFormLists } from "@/components/app/assets/asset-form";
import { Dot, Pill, Sheet, BusyButton, FormError, Select, money, type Tone } from "@/components/app/shared/kit";
import { ASSET_CATEGORIES, ASSET_STATUSES, categoryLabel, conditionMeta, statusMeta } from "@/lib/assets/categories";
import type { AssetRow, AssetFilters, AttentionItem } from "@/lib/data/assets";
import { cn } from "@/lib/utils";

export const CAT_ICON: Record<string, typeof Package> = {
  general: Package, "audio-visual": Monitor, musical: Music, furniture: Armchair, vehicle: Bus, IT: Cpu, kitchen: Utensils, other: HelpCircle,
};

export function AssetGlyph({ category, photoUrl, size = 40, className }: { category: string; photoUrl?: string | null; size?: number; className?: string }) {
  const Icon = CAT_ICON[category] ?? Package;
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface-2 text-ink-muted", className)} style={{ width: size, height: size }}>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <Icon style={{ width: size * 0.45, height: size * 0.45 }} />
      )}
    </span>
  );
}

const toneOf = (t: string): Tone => (t === "success" || t === "warning" || t === "danger" || t === "info" ? t : "muted");

type Summary = {
  book: number; cost: number; held: number; byStatus: Record<string, number>; lateCount: number; attention: AttentionItem[];
  categories: { key: string; count: number }[]; places: { value: string; label: string }[]; custodians: { value: string; label: string }[];
};

export function AssetsClient({ initial, initialQuery, summary, lists, canWrite, canPostExpenses }: {
  initial: { rows: AssetRow[]; total: number; page: number };
  initialQuery: string;
  summary: Summary;
  lists: AssetFormLists;
  canWrite: boolean;
  canPostExpenses: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<AssetFilters>({});
  const [view, setView] = useState<"list" | "photos">("list");
  const [adding, setAdding] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const list = useServerList<AssetRow, AssetFilters>({ initial, query, filters, fetchPage: searchAssets, pageSize: 20 });
  const set = (patch: Partial<AssetFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const activeCount = [filters.category, filters.status, filters.place, filters.custodian].filter(Boolean).length;
  const worn = Math.max(0, summary.cost - summary.book);
  const empty = summary.held === 0 && (summary.byStatus.disposed ?? 0) === 0;

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOnPage = list.rows.length > 0 && list.rows.every((r) => selected.has(r.id));

  const statusCounts = [
    { key: "in-service", label: "In service" },
    { key: "checked-out", label: "Out with people", extra: summary.lateCount ? `${summary.lateCount} late` : null },
    { key: "in-repair", label: "In repair" },
    { key: "in-storage", label: "In storage" },
    { key: "disposed", label: "Disposed" },
  ].filter((s) => (summary.byStatus[s.key] ?? 0) > 0 || s.key === "in-service");

  return (
    <div>
      <PageHeader title="Assets" description="What the church owns, where it is, who has it and what it is worth today.">
        <div className="hidden items-center gap-2 sm:flex">
          <PendingLink href="/app/assets/tags" icon={<Printer />} size="sm" pendingLabel="Opening…">Print tags</PendingLink>
          <a href={`/api/export/assets?format=xlsx`} className={buttonVariants({ variant: "secondary", size: "sm" })}><Download /> Export</a>
        </div>
        <div className="relative sm:hidden">
          <Button variant="secondary" size="sm" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}><MoreHorizontal /> More</Button>
          {moreOpen && (
            <div className="absolute right-0 z-30 mt-1 w-44 rounded-xl border border-line bg-surface p-1 shadow-xl">
              <Link href="/app/assets/tags" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"><Printer className="size-4" /> Print tags</Link>
              <a href={`/api/export/assets?format=xlsx`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"><Download className="size-4" /> Export</a>
            </div>
          )}
        </div>
        {canWrite && <Button size="sm" onClick={() => setAdding(true)}><Plus /> Add asset</Button>}
      </PageHeader>

      {empty ? (
        <EmptyStart canWrite={canWrite} onAdd={() => setAdding(true)} />
      ) : (
        <div className="space-y-4">
          {/* The register band: one statement of worth, then where everything is. */}
          <Card className="p-0">
            <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <div className="border-b border-line p-5 md:border-b-0 md:border-r">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Worth today</p>
                <p className="mt-1 font-display text-4xl font-bold tracking-tight tabular-nums">{money(summary.book)}</p>
                <p className="mt-1 text-sm text-ink-muted tabular-nums">
                  Cost {money(summary.cost)}{worn > 0 ? <>, worn down by {money(worn)}</> : null} · {summary.held.toLocaleString("en-GB")} item{summary.held === 1 ? "" : "s"}
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Where things are</p>
                <div className="mt-2 flex flex-wrap gap-x-1 gap-y-1.5 text-sm">
                  {statusCounts.map((s, i) => {
                    const on = filters.status === s.key;
                    return (
                      <span key={s.key} className="flex items-center">
                        {i > 0 && <span className="mx-1.5 text-ink-faint" aria-hidden>·</span>}
                        <button onClick={() => set({ status: on ? "" : s.key })} className={cn("rounded-md px-1 py-0.5 hover:bg-surface-2", on && "bg-primary-soft/50 text-primary")}>
                          <span className="text-ink-muted">{s.label}</span> <span className="font-semibold tabular-nums text-ink">{summary.byStatus[s.key] ?? 0}</span>
                          {s.extra && <span className="ml-1 font-medium text-danger">({s.extra})</span>}
                        </button>
                      </span>
                    );
                  })}
                </div>
                {summary.attention.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-line-soft pt-3">
                    {summary.attention.map((a, i) => (
                      <li key={i}>
                        <Link href={a.href} className="flex items-start gap-2 text-sm text-ink hover:text-primary">
                          <AlertTriangle className={cn("mt-0.5 size-3.5 shrink-0", a.kind === "late" ? "text-danger" : "text-warning")} />
                          <span>{a.text}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          {/* Search and filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-60">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
              <Input placeholder="Search name, tag, serial or person" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" aria-label="Search assets" />
              {list.searching && <Spinner size="sm" className="absolute right-3 top-3.5 text-primary" />}
            </div>
            <div className="hidden flex-wrap items-center gap-2 lg:flex">
              <FilterSelects filters={filters} set={set} summary={summary} />
            </div>
            <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setFiltersOpen(true)}><SlidersHorizontal /> Filters{activeCount ? ` (${activeCount})` : ""}</Button>
            <div className="ml-auto inline-flex rounded-xl border border-line bg-base p-1" role="radiogroup" aria-label="View">
              {([["list", LayoutList, "List"], ["photos", LayoutGrid, "Photos"]] as const).map(([v, Icon, label]) => (
                <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)} className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium", view === v ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>
          {activeCount > 0 && (
            <button onClick={() => setFilters({})} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><X className="size-3" /> Clear filters</button>
          )}

          {list.rows.length === 0 ? (
            <Card className="grid place-items-center gap-2 px-6 py-14 text-center text-sm text-ink-muted">
              <Package className="size-8 text-ink-faint" />
              Nothing matches. Try another word or clear the filters.
            </Card>
          ) : view === "photos" ? (
            <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 transition-opacity", list.searching && "opacity-60")}>
              {list.rows.map((a) => (
                <Link key={a.id} href={a.vehicleId ? `/app/vehicles/${a.vehicleId}` : `/app/assets/${a.id}`} className="card-surface group overflow-hidden">
                  <div className="aspect-[4/3] bg-surface-2">
                    {a.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.photoUrl} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
                    ) : (
                      <div className="grid size-full place-items-center text-ink-faint">{(() => { const I = CAT_ICON[a.category] ?? Package; return <I className="size-8" />; })()}</div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-semibold">{a.name}{a.quantity > 1 && <span className="font-normal text-ink-muted"> x{a.quantity}</span>}</p>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-ink-faint">{a.tagCode ?? "No tag"}</span>
                      <span className="text-xs font-semibold tabular-nums">{money(a.book)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Card className={cn("overflow-hidden p-0 transition-opacity", list.searching && "opacity-60")}>
              {/* Desktop table */}
              <table className="hidden w-full text-sm md:table">
                <thead className="border-b border-line bg-surface-2/50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  <tr>
                    {canWrite && (
                      <th className="w-10 px-4 py-2.5"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={() => setSelected((s) => { const n = new Set(s); for (const r of list.rows) { if (allOnPage) n.delete(r.id); else n.add(r.id); } return n; })} className="size-4 accent-[var(--color-primary)]" /></th>
                    )}
                    <th className="px-4 py-2.5">Item</th>
                    <th className="px-3 py-2.5">Category</th>
                    <th className="px-3 py-2.5">Where and who</th>
                    <th className="px-3 py-2.5">Condition</th>
                    <th className="px-3 py-2.5 text-right">Worth</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {list.rows.map((a) => {
                    const href = a.vehicleId ? `/app/vehicles/${a.vehicleId}` : `/app/assets/${a.id}`;
                    const st = statusMeta(a.status), cond = conditionMeta(a.condition);
                    return (
                      <tr key={a.id} className={cn("group hover:bg-surface-2/40", selected.has(a.id) && "bg-primary-soft/20")}>
                        {canWrite && <td className="px-4 py-2.5"><input type="checkbox" aria-label={`Select ${a.name}`} checked={selected.has(a.id)} onChange={() => toggle(a.id)} className="size-4 accent-[var(--color-primary)]" /></td>}
                        <td className="px-4 py-2.5">
                          <Link href={href} className="flex items-center gap-3">
                            <AssetGlyph category={a.category} photoUrl={a.photoUrl} />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-ink group-hover:text-primary">{a.name}{a.quantity > 1 && <span className="font-normal text-ink-muted"> x{a.quantity}</span>}</span>
                              <span className="block font-mono text-[11px] text-ink-faint">{a.tagCode ?? "No tag yet"}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-ink-muted">{categoryLabel(a.category)}</td>
                        <td className="max-w-[16rem] truncate px-3 py-2.5 text-ink-muted">{[a.place, a.custodian].filter(Boolean).join(" · ") || <span className="text-ink-faint">Not set</span>}</td>
                        <td className="px-3 py-2.5"><Dot tone={toneOf(cond.tone)}>{cond.label}</Dot></td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{a.cost ? money(a.book) : <span className="font-normal text-ink-faint">-</span>}</td>
                        <td className="px-4 py-2.5"><Pill tone={toneOf(st.tone)}>{st.label}</Pill></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Phone rows */}
              <ul className="divide-y divide-line-soft md:hidden">
                {list.rows.map((a) => (
                  <li key={a.id}>
                    <Link href={a.vehicleId ? `/app/vehicles/${a.vehicleId}` : `/app/assets/${a.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                      <AssetGlyph category={a.category} photoUrl={a.photoUrl} size={48} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-sm font-medium">{a.name}</span>
                          <span className="shrink-0 font-mono text-[10px] text-ink-faint">{a.tagCode}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-muted">{[a.place, a.custodian].filter(Boolean).join(" · ") || statusMeta(a.status).label}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums">{a.cost ? money(a.book) : ""}</span>
                        {a.status !== "in-service" && <Dot tone={toneOf(statusMeta(a.status).tone)} className="justify-end">{statusMeta(a.status).label}</Dot>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {list.pager}
        </div>
      )}

      {selected.size > 0 && canWrite && <BulkBar ids={[...selected]} places={summary.places} onDone={() => setSelected(new Set())} />}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="grid gap-3">
          <FilterSelects filters={filters} set={set} summary={summary} stacked />
          <Button onClick={() => setFiltersOpen(false)}>Show results</Button>
        </div>
      </Sheet>

      {adding && <AssetForm lists={lists} canPostExpenses={canPostExpenses} onClose={() => setAdding(false)} />}
    </div>
  );
}

function FilterSelects({ filters, set, summary, stacked }: { filters: AssetFilters; set: (p: Partial<AssetFilters>) => void; summary: Summary; stacked?: boolean }) {
  const cls = stacked ? "" : "h-9 w-auto py-0 text-xs";
  return (
    <>
      <Select className={cls} value={filters.category ?? ""} onChange={(v) => set({ category: v })} options={[{ value: "", label: "All categories" }, ...ASSET_CATEGORIES.filter((c) => summary.categories.some((x) => x.key === c.key)).map((c) => ({ value: c.key, label: `${c.label} (${summary.categories.find((x) => x.key === c.key)?.count ?? 0})` }))]} />
      <Select className={cls} value={filters.status ?? ""} onChange={(v) => set({ status: v })} options={[{ value: "", label: "Any status" }, ...ASSET_STATUSES.map((s) => ({ value: s.key, label: s.label })), { value: "late", label: "Late back" }]} />
      {summary.places.length > 0 && <Select className={cls} value={filters.place ?? ""} onChange={(v) => set({ place: v })} options={[{ value: "", label: "Any room" }, ...summary.places]} />}
      {summary.custodians.length > 0 && <Select className={cls} value={filters.custodian ?? ""} onChange={(v) => set({ custodian: v })} options={[{ value: "", label: "Anyone" }, ...summary.custodians]} />}
      <Select className={cls} value={filters.sort ?? ""} onChange={(v) => set({ sort: v })} options={[{ value: "", label: "Newest first" }, { value: "name", label: "Name" }, { value: "value", label: "Highest cost" }]} />
    </>
  );
}

function BulkBar({ ids, places, onDone }: { ids: string[]; places: { value: string; label: string }[]; onDone: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [mode, setMode] = useState<"" | "place" | "custodian" | "status">("");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const tagsHref = useMemo(() => `/app/assets/tags?ids=${ids.join(",")}`, [ids]);

  const apply = () => {
    setError("");
    const fd = new FormData();
    fd.set("ids", ids.join(","));
    fd.set("field", mode);
    fd.set("value", value);
    start(async () => {
      const r = await bulkUpdateAssets(fd);
      if (r.ok) { toast(`Updated ${r.count} item${r.count === 1 ? "" : "s"}`, "success"); setMode(""); onDone(); router.refresh(); }
      else setError(r.error ?? "That did not save.");
    });
  };

  return (
    <>
      <div className="fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-line bg-elevated px-4 py-3 shadow-2xl">
        <span className="mr-auto text-sm font-semibold">{ids.length} selected</span>
        <PendingLink href={tagsHref} icon={<Tag />} size="sm" pendingLabel="Opening…">Print tags</PendingLink>
        <Button size="sm" variant="secondary" onClick={() => { setMode("place"); setValue(""); }}><MapPin /> Move to room</Button>
        <Button size="sm" variant="secondary" onClick={() => { setMode("custodian"); setValue(""); }}><UserRound /> Change custodian</Button>
        <Button size="sm" variant="ghost" onClick={onDone} aria-label="Clear selection"><X /></Button>
      </div>
      <Sheet open={!!mode} onClose={() => setMode("")} busy={pending} title={mode === "place" ? "Move to room" : "Change custodian"} description={`${ids.length} item${ids.length === 1 ? "" : "s"}`}>
        <div className="space-y-4">
          {mode === "place" ? (
            places.length ? <Select value={value} onChange={setValue} options={[{ value: "", label: "Choose a room" }, ...places]} />
              : <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Where they are kept" />
          ) : (
            <SearchSelect value={value} onChange={(v) => setValue(v)} options={[{ value: "", label: "Nobody in particular" }]} placeholder="Search for a person…" search={(q) => searchPickerPeople("assets", q, { who: "notVisitor" })} />
          )}
          <FormError error={error} />
          <BusyButton type="button" busy={pending} onClick={apply} className="w-full" disabled={mode === "place" && !value}>Apply to {ids.length}</BusyButton>
        </div>
      </Sheet>
    </>
  );
}

function EmptyStart({ canWrite, onAdd }: { canWrite: boolean; onAdd: () => void }) {
  return (
    <Card className="p-6 sm:p-8">
      <h2 className="font-display text-xl font-bold">Start your register</h2>
      <p className="mt-1 max-w-xl text-sm text-ink-muted">Write down what the church owns once, and you will always know where it is, who has it and what it is worth.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <button onClick={onAdd} disabled={!canWrite} className="rounded-xl border border-line bg-surface p-4 text-left hover:border-primary/50 disabled:opacity-50">
          <Monitor className="size-5 text-primary" />
          <p className="mt-2 text-sm font-semibold">Add sound equipment</p>
          <p className="text-xs text-ink-muted">Mixers, speakers, mics, projector</p>
        </button>
        <Link href="/app/vehicles" className="rounded-xl border border-line bg-surface p-4 hover:border-primary/50">
          <Bus className="size-5 text-primary" />
          <p className="mt-2 text-sm font-semibold">Add a vehicle</p>
          <p className="text-xs text-ink-muted">Buses with trips, fuel and papers</p>
        </Link>
        <div className="rounded-xl border border-dashed border-line p-4">
          <Tag className="size-5 text-ink-faint" />
          <p className="mt-2 text-sm font-semibold">Print tags later</p>
          <p className="text-xs text-ink-muted">Every item gets a number like AST-0001 and a QR label</p>
        </div>
      </div>
    </Card>
  );
}
