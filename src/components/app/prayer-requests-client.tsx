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
  const [filter, setFilter] = useState<"all" | "active" | "answered">("all");
  const [pending, start] = useTransition();

  const filtered = items.filter((p) => {
    if (filter === "active" && p.status !== "active") return false;
    if (filter === "answered" && p.status !== "answered") return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.request.toLowerCase().includes(q);
  });

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
    start(() => deletePrayerRequest(fd));
  };

  const copyLink = () => {
    navigator.clipboard.writeText(prayUrl);
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            placeholder="Search prayer requests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "active", "answered"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "primary" : "secondary"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "active" ? "Active" : "Answered"}
            </Button>
          ))}
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
            {search ? "No prayer requests match your search." : "No prayer requests yet. Share your prayer link with the congregation."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
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
        </div>
      )}
    </div>
  );
}
