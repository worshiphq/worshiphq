"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search, BookHeart, Trash2, Calendar, User, BookOpen, Eye, EyeOff,
} from "lucide-react";
import { deleteDevotional, toggleDevotionalPublished } from "@/app/actions/devotionals";

type DevotionalRow = {
  id: string;
  title: string;
  scripture: string | null;
  body: string;
  author: string | null;
  published: boolean;
  date: string;
};

export function DevotionalsClient({ devotionals }: { devotionals: DevotionalRow[] }) {
  const [search, setSearch] = useState("");
  const [pending, start] = useTransition();

  const filtered = devotionals.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.title.toLowerCase().includes(q) || d.body.toLowerCase().includes(q) || d.scripture?.toLowerCase().includes(q);
  });

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => deleteDevotional(fd));
  };

  const handleToggle = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => toggleDevotionalPublished(fd));
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          placeholder="Search devotionals..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <BookHeart className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {search ? "No devotionals match your search." : "No devotionals yet. Share daily encouragement with your congregation."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => (
            <Card key={d.id} className={`p-5 ${pending ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{d.title}</h3>
                    {!d.published && <Badge variant="default" className="bg-amber-100 text-[10px] text-amber-700">Draft</Badge>}
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-ink-faint">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    {d.scripture && (
                      <span className="flex items-center gap-1">
                        <BookOpen className="size-3" /> {d.scripture}
                      </span>
                    )}
                    {d.author && (
                      <span className="flex items-center gap-1">
                        <User className="size-3" /> {d.author}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">{d.body}</p>
                </div>

                <div className="flex shrink-0 gap-1">
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
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
