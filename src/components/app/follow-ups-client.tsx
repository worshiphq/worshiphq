"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, CheckCircle2, Clock, Circle, UserRoundPlus, UserPlus, Heart, ListTodo,
  Calendar, User, Trash2,
} from "lucide-react";
import { updateFollowUpStatus, deleteFollowUp } from "@/app/actions/follow-ups";

type FollowUpRow = {
  id: string;
  title: string;
  type: string;
  note: string | null;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  personName: string | null;
  visitorName: string | null;
  assigneeName: string | null;
};

const TYPE_META: Record<string, { icon: typeof Heart; label: string }> = {
  new_visitor: { icon: UserRoundPlus, label: "Visitor" },
  new_member: { icon: UserPlus, label: "New member" },
  pastoral: { icon: Heart, label: "Pastoral" },
  custom: { icon: ListTodo, label: "Task" },
};

const STATUS_META: Record<string, { icon: typeof Circle; label: string; color: string }> = {
  open: { icon: Circle, label: "Open", color: "text-warning" },
  in_progress: { icon: Clock, label: "In progress", color: "text-info" },
  done: { icon: CheckCircle2, label: "Done", color: "text-success" },
};

export function FollowUpsClient({ items }: { items: FollowUpRow[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");
  const [pending, start] = useTransition();

  const filtered = items.filter((f) => {
    if (filter === "open" && f.status === "done") return false;
    if (filter === "done" && f.status !== "done") return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      f.title.toLowerCase().includes(q) ||
      f.personName?.toLowerCase().includes(q) ||
      f.visitorName?.toLowerCase().includes(q) ||
      f.assigneeName?.toLowerCase().includes(q)
    );
  });

  const handleStatus = (id: string, status: string) => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", status);
    start(() => updateFollowUpStatus(fd));
  };

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => deleteFollowUp(fd));
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            placeholder="Search follow-ups…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "open", "done"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "primary" : "secondary"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "open" ? "Active" : "Done"}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <CheckCircle2 className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {search ? "No follow-ups match your search." : "No follow-ups yet. They're auto-created when visitors submit forms."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => {
            const typeMeta = TYPE_META[f.type] ?? TYPE_META.custom;
            const statusMeta = STATUS_META[f.status] ?? STATUS_META.open;
            const TypeIcon = typeMeta.icon;
            const StatusIcon = statusMeta.icon;
            const isOverdue = f.dueDate && f.status !== "done" && new Date(f.dueDate) < new Date();

            return (
              <Card key={f.id} className={`flex items-start gap-3 p-4 ${pending ? "opacity-60" : ""}`}>
                <button
                  onClick={() => handleStatus(f.id, f.status === "done" ? "open" : f.status === "open" ? "in_progress" : "done")}
                  className="mt-0.5 shrink-0"
                  title={`Mark as ${f.status === "done" ? "open" : f.status === "open" ? "in progress" : "done"}`}
                >
                  <StatusIcon className={`size-5 ${statusMeta.color}`} />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-medium ${f.status === "done" ? "text-ink-muted line-through" : ""}`}>
                      {f.title}
                    </span>
                    <Badge variant="default" className="text-[10px] gap-1">
                      <TypeIcon className="size-3" /> {typeMeta.label}
                    </Badge>
                    {isOverdue && <Badge variant="gold" className="text-[10px]">Overdue</Badge>}
                  </div>

                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-muted">
                    {(f.visitorName || f.personName) && (
                      <span className="flex items-center gap-1">
                        <User className="size-3" /> {f.visitorName ?? f.personName}
                      </span>
                    )}
                    {f.assigneeName && (
                      <span>Assigned to {f.assigneeName}</span>
                    )}
                    {f.dueDate && (
                      <span className={`flex items-center gap-1 ${isOverdue ? "text-warning font-medium" : ""}`}>
                        <Calendar className="size-3" />
                        Due {new Date(f.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>

                  {f.note && (
                    <p className="mt-1 text-xs text-ink-faint italic">{f.note}</p>
                  )}
                </div>

                <button
                  onClick={() => handleDelete(f.id)}
                  className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
                  title="Delete"
                >
                  <Trash2 className="size-4" />
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
