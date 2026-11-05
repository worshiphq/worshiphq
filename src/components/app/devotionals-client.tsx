"use client";

import { useServerList } from "@/components/ui/use-server-list";
import { searchDevotionals } from "@/app/actions/lists";
import type { DevotionalFilters } from "@/lib/data/lists-a";
import { useState, useTransition } from "react";
import Link from "@/components/ui/app-link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, BookHeart, Trash2, Calendar, User, BookOpen, Eye, EyeOff, Send, Pencil } from "lucide-react";
import { deleteDevotional, toggleDevotionalPublished } from "@/app/actions/devotionals";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";
import { DevotionalSendDialog, type AudienceOption } from "@/components/app/devotional-send-dialog";
import type { PickerOption } from "@/components/app/multi-picker";
import { filterSelectCls, Pager } from "@/components/app/list-filters";
import { splitScriptures } from "@/components/app/scripture-input";

type DevotionalRow = {
  id: string;
  title: string;
  scripture: string | null;
  body: string;
  author: string | null;
  published: boolean;
  date: string;
};

export function DevotionalsClient({
  initial, options, audiences, canWrite,
}: { initial: { rows: DevotionalRow[]; total: number; page: number }; options: { authors: string[]; years: number[] }; audiences: AudienceOption[]; canWrite: boolean }) {
  const [search, setSearch] = useState("");
  const [author, setAuthor] = useState("");
  const [year, setYear] = useState("");
  const [state, setState] = useState<"" | "published" | "draft">("");
  const [pending, start] = useTransition();
  const [sendFor, setSendFor] = useState<DevotionalRow | null>(null);
  const PAGE_SIZE = 12;

  const authors = options.authors;
  const years = options.years;
  const list = useServerList<DevotionalRow, DevotionalFilters>({ initial, query: search, filters: { author, year, state }, fetchPage: searchDevotionals, pageSize: PAGE_SIZE });
  const filtering = !!(search || author || year || state);
  const reset = (fn: () => void) => { fn(); };

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    if (!confirmBinDelete("Delete this devotional?")) return;
    start(async () => { await deleteDevotional(fd); binDeleted(); });
  };

  const handleToggle = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => toggleDevotionalPublished(fd));
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input placeholder="Search devotionals..." value={search} onChange={(e) => reset(() => setSearch(e.target.value))} className="pl-10 pr-10" />
          {list.spinner}
        </div>
        {authors.length > 0 && (
          <select value={author} onChange={(e) => reset(() => setAuthor(e.target.value))} className={filterSelectCls} aria-label="Author">
            <option value="">All authors</option>
            {authors.map((a) => <option key={a} value={a}>{a}</option>)}
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
        {filtering && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setAuthor(""); setYear(""); setState(""); }}>Clear filters</Button>}
      </div>

      {list.rows.length === 0 ? (
        <Card className="p-12 text-center">
          <BookHeart className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {filtering ? "No devotionals match those filters." : "No devotionals yet. Share daily encouragement with your congregation."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.rows.map((d) => (
            <Card key={d.id} className={`p-5 ${pending ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/app/devotionals/${d.id}`} className="text-sm font-semibold hover:text-primary">{d.title}</Link>
                    {!d.published && <Badge variant="default" className="bg-amber-100 text-[10px] text-amber-700">Draft</Badge>}
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    {splitScriptures(d.scripture).map((r) => (
                      <span key={r} className="flex items-center gap-1"><BookOpen className="size-3" /> {r}</span>
                    ))}
                    {d.author && <span className="flex items-center gap-1"><User className="size-3" /> {d.author}</span>}
                  </div>

                  <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-ink-muted">{d.body}</p>

                  {canWrite && (
                    <div className="mt-3">
                      <Button size="sm" variant="secondary" onClick={() => setSendFor(d)}>
                        <Send /> Text to members
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 gap-1">
                  <Link href={`/app/devotionals/${d.id}`} className="rounded-lg p-1.5 text-ink-faint hover:bg-brand/10 hover:text-brand" title={canWrite ? "Open and edit" : "Open"}>
                    <Pencil className="size-4" />
                  </Link>
                  {canWrite && (
                    <>
                      <button
                        onClick={() => handleToggle(d.id)}
                        className="rounded-lg p-1.5 text-ink-faint hover:bg-brand/10 hover:text-brand"
                        title={d.published ? "Unpublish" : "Publish"}
                      >
                        {d.published ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                      </button>
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
                        title="Delete"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {sendFor && <DevotionalSendDialog devotional={sendFor} audiences={audiences} onClose={() => setSendFor(null)} />}
      {list.pager}
    </div>
  );
}
