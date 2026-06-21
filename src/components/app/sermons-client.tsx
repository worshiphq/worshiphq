"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search, BookOpen, Trash2, Calendar, User, Video, Headphones, Eye, EyeOff, BookMarked,
} from "lucide-react";
import { deleteSermon, toggleSermonPublished } from "@/app/actions/sermons";

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

export function SermonsClient({ sermons }: { sermons: SermonRow[] }) {
  const [search, setSearch] = useState("");
  const [pending, start] = useTransition();

  const filtered = sermons.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      s.preacher?.toLowerCase().includes(q) ||
      s.series?.toLowerCase().includes(q) ||
      s.scripture?.toLowerCase().includes(q)
    );
  });

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => deleteSermon(fd));
  };

  const handleTogglePublished = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => toggleSermonPublished(fd));
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          placeholder="Search sermons..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <BookOpen className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {search ? "No sermons match your search." : "No sermons yet. Add your first sermon to start building your library."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <Card key={s.id} className={`p-4 ${pending ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                  <BookMarked className="size-4 text-brand" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{s.title}</span>
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
                    {s.scripture && (
                      <span className="flex items-center gap-1">
                        <BookOpen className="size-3" /> {s.scripture}
                      </span>
                    )}
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
                  <button
                    onClick={() => handleTogglePublished(s.id)}
                    className="rounded-lg p-1.5 text-ink-faint hover:bg-brand/10 hover:text-brand"
                    title={s.published ? "Unpublish" : "Publish"}
                  >
                    {s.published ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
