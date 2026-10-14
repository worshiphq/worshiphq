"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search, BookOpen, Trash2, Calendar, User, Video, Headphones, Eye, EyeOff, BookMarked, Pencil,
} from "lucide-react";
import { deleteSermon, toggleSermonPublished } from "@/app/actions/sermons";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";
import { Button } from "@/components/ui/button";
import { filterSelectCls, Pager } from "@/components/app/list-filters";
import { splitScriptures } from "@/components/app/scripture-input";

type SermonRow = {
  id: string;
  title: string;
  preacher: string | null;
  series: string | null;
  scripture: string | null;
  notes: string | null;
  audioUrl: string | null;
  videoUrl: string | null;
  published: boolean;
  date: string;
};

export function SermonsClient({ sermons, canWrite }: { sermons: SermonRow[]; canWrite: boolean }) {
  const [search, setSearch] = useState("");
  const [preacher, setPreacher] = useState("");
  const [series, setSeries] = useState("");
  const [year, setYear] = useState("");
  const [state, setState] = useState<"" | "published" | "draft">("");
  const [page, setPage] = useState(1);
  const [pending, start] = useTransition();
  const PAGE_SIZE = 15;

  const preachers = [...new Set(sermons.map((s) => s.preacher).filter((x): x is string => !!x))].sort();
  const seriesList = [...new Set(sermons.map((s) => s.series).filter((x): x is string => !!x))].sort();
  const years = [...new Set(sermons.map((s) => new Date(s.date).getFullYear()))].sort((a, b) => b - a);
  const q = search.trim().toLowerCase();

  const filtered = sermons.filter((s) => {
    if (preacher && s.preacher !== preacher) return false;
    if (series && s.series !== series) return false;
    if (year && new Date(s.date).getFullYear() !== Number(year)) return false;
    if (state === "published" && !s.published) return false;
    if (state === "draft" && s.published) return false;
    if (!q) return true;
    return (
      s.title.toLowerCase().includes(q) ||
      !!s.preacher?.toLowerCase().includes(q) ||
      !!s.series?.toLowerCase().includes(q) ||
      !!s.scripture?.toLowerCase().includes(q) ||
      !!s.notes?.toLowerCase().includes(q)
    );
  });
  const filtering = !!(search || preacher || series || year || state);
  const cur = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const shown = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  const reset = (fn: () => void) => { fn(); setPage(1); };

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    if (!confirmBinDelete("Delete this sermon?")) return;
    start(async () => { await deleteSermon(fd); binDeleted(); });
  };

  const handleTogglePublished = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => toggleSermonPublished(fd));
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input placeholder="Search title, scripture, notes..." value={search} onChange={(e) => reset(() => setSearch(e.target.value))} className="pl-10" />
        </div>
        {preachers.length > 0 && (
          <select value={preacher} onChange={(e) => reset(() => setPreacher(e.target.value))} className={filterSelectCls} aria-label="Preacher">
            <option value="">All preachers</option>
            {preachers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        {seriesList.length > 0 && (
          <select value={series} onChange={(e) => reset(() => setSeries(e.target.value))} className={filterSelectCls} aria-label="Series">
            <option value="">All series</option>
            {seriesList.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <select value={year} onChange={(e) => reset(() => setYear(e.target.value))} className={filterSelectCls} aria-label="Year">
          <option value="">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={state} onChange={(e) => reset(() => setState(e.target.value as typeof state))} className={filterSelectCls} aria-label="Status">
          <option value="">Published and drafts</option>
          <option value="published">Published</option>
          <option value="draft">Drafts</option>
        </select>
        {filtering && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setPreacher(""); setSeries(""); setYear(""); setState(""); setPage(1); }}>Clear filters</Button>}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <BookOpen className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {filtering ? "No sermons match those filters." : "No sermons yet. Add your first sermon to start building your library."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {shown.map((s) => (
            <Card key={s.id} className={`p-4 ${pending ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                  <BookMarked className="size-4 text-brand" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/app/sermons/${s.id}`} className="text-sm font-medium hover:text-primary">{s.title}</Link>
                    {s.series && <Badge variant="default" className="text-[10px]">{s.series}</Badge>}
                    {!s.published && <Badge variant="default" className="bg-amber-100 text-[10px] text-amber-700">Draft</Badge>}
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-ink-faint">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {new Date(s.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    {s.preacher && (
                      <span className="flex items-center gap-1">
                        <User className="size-3" /> {s.preacher}
                      </span>
                    )}
                    {splitScriptures(s.scripture).map((r) => (
                      <span key={r} className="flex items-center gap-1">
                        <BookOpen className="size-3" /> {r}
                      </span>
                    ))}
                  </div>

                  {s.notes && (
                    <p className="mt-1.5 line-clamp-2 text-xs text-ink-muted">{s.notes}</p>
                  )}

                  {(s.audioUrl || s.videoUrl) && (
                    <div className="mt-2 flex gap-2">
                      {s.audioUrl && (
                        <a href={s.audioUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg bg-surface-raised px-2.5 py-1 text-xs text-brand hover:bg-brand/10">
                          <Headphones className="size-3" /> Audio
                        </a>
                      )}
                      {s.videoUrl && (
                        <a href={s.videoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg bg-surface-raised px-2.5 py-1 text-xs text-brand hover:bg-brand/10">
                          <Video className="size-3" /> Video
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 gap-1">
                  <Link href={`/app/sermons/${s.id}`} className="rounded-lg p-1.5 text-ink-faint hover:bg-brand/10 hover:text-brand" title={canWrite ? "Open and edit" : "Open"}>
                    <Pencil className="size-4" />
                  </Link>
                  {canWrite && <button
                    onClick={() => handleTogglePublished(s.id)}
                    className="rounded-lg p-1.5 text-ink-faint hover:bg-brand/10 hover:text-brand"
                    title={s.published ? "Unpublish" : "Publish"}
                  >
                    {s.published ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>}
                  {canWrite && <button
                    onClick={() => handleDelete(s.id)}
                    className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
                  </button>}
                </div>
              </div>
            </Card>
          ))}
          <Pager page={cur} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
