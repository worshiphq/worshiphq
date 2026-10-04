"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, CheckCircle2, Clock, Circle, UserRoundPlus, UserPlus, Heart, ListTodo,
  Calendar, User, Trash2, Loader2,
} from "lucide-react";
import { updateFollowUpStatus, deleteFollowUp, assignFollowUp, setFollowUpDue } from "@/app/actions/follow-ups";
import { cn } from "@/lib/utils";

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
  assigneeId: string | null;
  assigneeName: string | null;
};

const TYPE_META: Record<string, { icon: typeof Heart; label: string }> = {
  new_visitor: { icon: UserRoundPlus, label: "Visitor" },
  new_member: { icon: UserPlus, label: "New member" },
  pastoral: { icon: Heart, label: "Pastoral" },
  custom: { icon: ListTodo, label: "Task" },
};

const STATUSES = [
  { value: "open", label: "Open", icon: Circle, active: "bg-warning/15 text-warning border-warning/30" },
  { value: "in_progress", label: "In progress", icon: Clock, active: "bg-info/15 text-info border-info/30" },
  { value: "done", label: "Done", icon: CheckCircle2, active: "bg-success/15 text-success border-success/30" },
] as const;

type Filter = "active" | "mine" | "overdue" | "done" | "all";

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function FollowUpsClient({
  items, users, me, canWrite,
}: { items: FollowUpRow[]; users: { id: string; name: string }[]; me: string; canWrite: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [, start] = useTransition();

  const today = startOfToday();
  const isOverdue = (f: FollowUpRow) => !!f.dueDate && f.status !== "done" && new Date(f.dueDate).getTime() < today;
  const isActive = (f: FollowUpRow) => f.status !== "done";

  const counts = {
    active: items.filter(isActive).length,
    mine: items.filter((f) => isActive(f) && f.assigneeId === me).length,
    overdue: items.filter(isOverdue).length,
    done: items.filter((f) => !isActive(f)).length,
    all: items.length,
  };

  const filtered = items.filter((f) => {
    if (filter === "active" && !isActive(f)) return false;
    if (filter === "mine" && !(isActive(f) && f.assigneeId === me)) return false;
    if (filter === "overdue" && !isOverdue(f)) return false;
    if (filter === "done" && isActive(f)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      f.title.toLowerCase().includes(q) ||
      f.personName?.toLowerCase().includes(q) ||
      f.visitorName?.toLowerCase().includes(q) ||
      f.assigneeName?.toLowerCase().includes(q)
    );
  });

  function run(id: string, fn: () => Promise<unknown>) {
    setError("");
    setBusy(id);
    start(async () => {
      try {
        const res = (await fn()) as { ok?: boolean; error?: string } | undefined;
        if (res && res.ok === false) setError(res.error ?? "Something went wrong.");
        router.refresh();
      } catch (e) {
        setError((e as Error).message || "Something went wrong.");
      }
      setBusy(null);
    });
  }

  const setStatus = (id: string, status: string) => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", status);
    run(id, () => updateFollowUpStatus(fd));
  };

  const remove = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    run(id, () => deleteFollowUp(fd));
  };

  const FILTERS: { key: Filter; label: string; danger?: boolean }[] = [
    { key: "active", label: "Active" },
    { key: "mine", label: "Mine" },
    { key: "overdue", label: "Overdue", danger: true },
    { key: "done", label: "Done" },
    { key: "all", label: "All" },
  ];

  const selectCls = "h-8 max-w-[11rem] rounded-lg border border-line bg-surface px-2 text-xs text-ink-muted outline-none focus:border-primary/50 disabled:opacity-60";

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input placeholder="Search follow-ups…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map(({ key, label, danger }) => (
            <Button key={key} variant={filter === key ? "primary" : "secondary"} size="sm" onClick={() => setFilter(key)}>
              {label}
              <span className={cn("ml-1 rounded-full px-1.5 text-[11px] font-semibold", filter === key ? "bg-white/25" : danger && counts[key] > 0 ? "bg-danger/15 text-danger" : "bg-surface-2 text-ink-faint")}>
                {counts[key]}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <CheckCircle2 className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {search
              ? "No follow-ups match your search."
              : filter === "mine"
                ? "Nothing is assigned to you right now."
                : filter === "overdue"
                  ? "Nothing is overdue. Well done."
                  : filter === "done"
                    ? "Nothing has been completed in the last 60 days."
                    : "No follow-ups yet. New visitors get one automatically."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => {
            const typeMeta = TYPE_META[f.type] ?? TYPE_META.custom;
            const TypeIcon = typeMeta.icon;
            const overdue = isOverdue(f);
            const saving = busy === f.id;
            const who = f.visitorName ?? f.personName;

            return (
              <Card key={f.id} className={cn("p-4", saving && "opacity-70")}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-sm font-medium", f.status === "done" && "text-ink-muted line-through")}>{f.title}</span>
                      <Badge variant="default" className="gap-1 text-[10px]">
                        <TypeIcon className="size-3" /> {typeMeta.label}
                      </Badge>
                      {overdue && <Badge variant="gold" className="text-[10px]">Overdue</Badge>}
                    </div>
                    {(who || f.note) && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-ink-muted">
                        {who && <span className="flex items-center gap-1"><User className="size-3" /> {who}</span>}
                        {f.note && <span className="italic text-ink-faint">{f.note}</span>}
                      </div>
                    )}
                  </div>
                  {saving && <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted"><Loader2 className="size-3.5 animate-spin" /> Saving…</span>}
                  {canWrite && (
                    <button
                      onClick={() => { if (confirm("Delete this follow-up?")) remove(f.id); }}
                      disabled={saving}
                      className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                      title="Delete"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="flex gap-1">
                    {STATUSES.map((s) => {
                      const on = f.status === s.value;
                      return (
                        <button
                          key={s.value}
                          disabled={!canWrite || saving || on}
                          onClick={() => setStatus(f.id, s.value)}
                          className={cn(
                            "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                            on ? s.active : "border-line text-ink-faint hover:bg-surface-2 hover:text-ink disabled:hover:bg-transparent",
                          )}
                        >
                          <s.icon className="size-3.5" /> {s.label}
                        </button>
                      );
                    })}
                  </div>

                  <select
                    value={f.assigneeId ?? ""}
                    disabled={!canWrite || saving}
                    onChange={(e) => run(f.id, () => assignFollowUp(f.id, e.target.value || null))}
                    className={selectCls}
                    aria-label="Assigned to"
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === me ? " (me)" : ""}</option>)}
                  </select>

                  <label className={cn("flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs", overdue ? "border-warning/40 text-warning" : "border-line text-ink-muted")}>
                    <Calendar className="size-3.5" />
                    <input
                      type="date"
                      value={f.dueDate ? f.dueDate.slice(0, 10) : ""}
                      disabled={!canWrite || saving}
                      onChange={(e) => run(f.id, () => setFollowUpDue(f.id, e.target.value || null))}
                      className="bg-transparent text-xs outline-none disabled:opacity-60"
                      aria-label="Due date"
                    />
                  </label>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
