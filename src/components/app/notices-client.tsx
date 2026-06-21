"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Pin, Trash2, Megaphone } from "lucide-react";
import { togglePinNotice, deleteNotice } from "@/app/actions/notices";

type NoticeRow = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
};

export function NoticesClient({ items }: { items: NoticeRow[] }) {
  const [search, setSearch] = useState("");
  const [pending, start] = useTransition();

  const filtered = items.filter((n) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
  });

  const handlePin = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => togglePinNotice(fd));
  };

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => deleteNotice(fd));
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          placeholder="Search notices..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Megaphone className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {search ? "No notices match your search." : "No notices yet. Post one to keep your team informed."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => (
            <Card
              key={n.id}
              className={`p-4 ${n.pinned ? "border-brand/30 bg-brand/5" : ""} ${pending ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{n.title}</h3>
                    {n.pinned && (
                      <Badge variant="default" className="bg-brand/10 text-brand text-[10px]">
                        <Pin className="mr-0.5 size-2.5" /> Pinned
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{n.body}</p>
                  <p className="mt-2 text-[10px] text-ink-faint">
                    {new Date(n.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => handlePin(n.id)}
                    className={`rounded-lg p-1.5 ${
                      n.pinned ? "text-brand hover:bg-brand/10" : "text-ink-faint hover:bg-surface-2"
                    }`}
                    title={n.pinned ? "Unpin" : "Pin to top"}
                  >
                    <Pin className="size-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(n.id)}
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
