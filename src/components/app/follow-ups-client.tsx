"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, CheckCircle2, Clock, Circle, UserRoundPlus, UserPlus, Heart, ListTodo,
  Calendar, User, Users, Trash2, Loader2, Phone, MessageCircle, Pencil, ChevronLeft, ChevronRight, X,
} from "lucide-react";
import { updateFollowUpStatus, deleteFollowUp, setFollowUpAssignees, setFollowUpDue, setFollowUpNote } from "@/app/actions/follow-ups";
import { normalisePhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { FollowUpReports, OutcomePill, type ReportRow } from "@/components/app/follow-up-reports";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";
import { MultiPicker } from "@/components/app/multi-picker";

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
  phone: string | null;
  assignees: { id: string; name: string }[];
  reports: ReportRow[];
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
type SortKey = "due" | "newest" | "oldest" | "name" | "completed";
type DateBy = "due" | "created" | "completed";

const PAGE_SIZE = 15;
const SORTS: { key: SortKey; label: string }[] = [
  { key: "due", label: "Soonest due first" },
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "name", label: "Name A to Z" },
  { key: "completed", label: "Recently completed" },
];
const DATE_BY: { key: DateBy; label: string }[] = [
  { key: "due", label: "Due date" },
  { key: "created", label: "Created" },
  { key: "completed", label: "Completed" },
];

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function FollowUpsClient({
  items, users, me, canWrite, canManage = false,
}: { items: FollowUpRow[]; users: { id: string; name: string }[]; me: string; canWrite: boolean; canManage?: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [assigning, setAssigning] = useState<{ id: string; ids: string[] } | null>(null);
  const [, start] = useTransition();
  // Sorting, narrowing and paging, so a long list never becomes one endless scroll.
  const [sort, setSort] = useState<SortKey>("due");
  const [typeF, setTypeF] = useState("all");
  const [whoF, setWhoF] = useState("all");
  const [dateBy, setDateBy] = useState<DateBy>("due");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const today = startOfToday();
  const isOverdue = (f: FollowUpRow) => !!f.dueDate && f.status !== "done" && new Date(f.dueDate).getTime() < today;
  const isActive = (f: FollowUpRow) => f.status !== "done";

  const counts = {
    active: items.filter(isActive).length,
    mine: items.filter((f) => isActive(f) && f.assignees.some((a) => a.id === me)).length,
    overdue: items.filter(isOverdue).length,
    done: items.filter((f) => !isActive(f)).length,
    all: items.length,
  };

  const dateOf = (f: FollowUpRow) => (dateBy === "due" ? f.dueDate : dateBy === "created" ? f.createdAt : f.completedAt);
  const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
  const toMs = to ? new Date(`${to}T23:59:59`).getTime() : null;

  const filtered = items.filter((f) => {
    if (filter === "active" && !isActive(f)) return false;
    if (filter === "mine" && !(isActive(f) && f.assignees.some((a) => a.id === me))) return false;
    if (filter === "overdue" && !isOverdue(f)) return false;
    if (filter === "done" && isActive(f)) return false;
    if (typeF !== "all" && f.type !== typeF) return false;
    if (whoF === "none" && f.assignees.length > 0) return false;
    if (whoF !== "all" && whoF !== "none" && !f.assignees.some((a) => a.id === whoF)) return false;
    if (fromMs !== null || toMs !== null) {
      const d = dateOf(f);
      if (!d) return false;
      const t = new Date(d).getTime();
      if (fromMs !== null && t < fromMs) return false;
      if (toMs !== null && t > toMs) return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      f.title.toLowerCase().includes(q) ||
      f.personName?.toLowerCase().includes(q) ||
      f.visitorName?.toLowerCase().includes(q) ||
      f.assignees.some((a) => a.name.toLowerCase().includes(q))
    );
  }).sort((x, y) => {
    const ms = (v: string | null, fallback: number) => (v ? new Date(v).getTime() : fallback);
    switch (sort) {
      case "newest": return ms(y.createdAt, 0) - ms(x.createdAt, 0);
      case "oldest": return ms(x.createdAt, 0) - ms(y.createdAt, 0);
      case "name": return (x.visitorName ?? x.personName ?? x.title).localeCompare(y.visitorName ?? y.personName ?? y.title);
      case "completed": return ms(y.completedAt, 0) - ms(x.completedAt, 0);
      default: return ms(x.dueDate, Infinity) - ms(y.dueDate, Infinity) || ms(y.createdAt, 0) - ms(x.createdAt, 0);
    }
  });

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const narrowed = typeF !== "all" || whoF !== "all" || !!from || !!to;
  const clearNarrow = () => { setTypeF("all"); setWhoF("all"); setFrom(""); setTo(""); setPage(1); };

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

  const saveNote = () => {
    if (!editing) return;
    const { id, text } = editing;
    run(id, async () => {
      const res = await setFollowUpNote(id, text);
      if (res.ok) setEditing(null);
      return res;
    });
  };

  const remove = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    run(id, async () => { await deleteFollowUp(fd); binDeleted(); });
  };

  const FILTERS: { key: Filter; label: string; danger?: boolean }[] = [
    { key: "active", label: "Active" },
    { key: "mine", label: "Mine" },
    { key: "overdue", label: "Overdue", danger: true },
    { key: "done", label: "Done" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input placeholder="Search follow-ups…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map(({ key, label, danger }) => (
            <Button key={key} variant={filter === key ? "primary" : "secondary"} size="sm" onClick={() => { setFilter(key); setPage(1); }}>
              {label}
              <span className={cn("ml-1 rounded-full px-1.5 text-[11px] font-semibold", filter === key ? "bg-white/25" : danger && counts[key] > 0 ? "bg-danger/15 text-danger" : "bg-surface-2 text-ink-faint")}>
                {counts[key]}
              </span>
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface-2/40 p-3">
        <label className="text-xs font-medium text-ink-muted">Sort
          <select value={sort} onChange={(e) => { setSort(e.target.value as SortKey); setPage(1); }} className="mt-1 block h-9 rounded-lg border border-line bg-surface px-2 text-sm">
            {SORTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-muted">Kind
          <select value={typeF} onChange={(e) => { setTypeF(e.target.value); setPage(1); }} className="mt-1 block h-9 rounded-lg border border-line bg-surface px-2 text-sm">
            <option value="all">All kinds</option>
            {Object.entries(TYPE_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
        </label>
        {users.length > 1 && (
          <label className="text-xs font-medium text-ink-muted">Assigned to
            <select value={whoF} onChange={(e) => { setWhoF(e.target.value); setPage(1); }} className="mt-1 block h-9 rounded-lg border border-line bg-surface px-2 text-sm">
              <option value="all">Anyone</option>
              <option value="none">Not assigned yet</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.id === me ? `${u.name} (me)` : u.name}</option>)}
            </select>
          </label>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-ink-muted">Dates by
            <select value={dateBy} onChange={(e) => { setDateBy(e.target.value as DateBy); setPage(1); }} className="mt-1 block h-9 rounded-lg border border-line bg-surface px-2 text-sm">
              {DATE_BY.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted">From
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="mt-1 block h-9 rounded-lg border border-line bg-surface px-2 text-sm" />
          </label>
          <label className="text-xs font-medium text-ink-muted">To
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="mt-1 block h-9 rounded-lg border border-line bg-surface px-2 text-sm" />
          </label>
        </div>
        {narrowed && (
          <Button size="sm" variant="ghost" onClick={clearNarrow}><X className="size-4" /> Clear filters</Button>
        )}
        <span className="ml-auto self-center text-xs text-ink-faint">{filtered.length} follow-up{filtered.length === 1 ? "" : "s"}</span>
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
          {shown.map((f) => {
            const typeMeta = TYPE_META[f.type] ?? TYPE_META.custom;
            const TypeIcon = typeMeta.icon;
            const overdue = isOverdue(f);
            const saving = busy === f.id;
            const who = f.visitorName ?? f.personName;
            const mine = f.assignees.some((a) => a.id === me);
            const canAct = canWrite || mine; // managers, and the people it is assigned to

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
                      {f.reports[0] && <OutcomePill outcome={f.reports[0].outcome} className="text-[10px]" />}
                    </div>
                    {who && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                        <span className="flex items-center gap-1"><User className="size-3" /> {who}</span>
                        {f.phone && (
                          <>
                            <span className="tabular-nums">{f.phone}</span>
                            <a href={`tel:${f.phone.replace(/\s+/g, "")}`} className="inline-flex h-7 items-center gap-1 rounded-lg border border-line px-2 font-medium text-ink hover:bg-surface-2">
                              <Phone className="size-3" /> Call
                            </a>
                            <a
                              href={`https://wa.me/${normalisePhone(f.phone)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-7 items-center gap-1 rounded-lg border border-line px-2 font-medium text-ink hover:bg-surface-2"
                            >
                              <MessageCircle className="size-3" /> WhatsApp
                            </a>
                          </>
                        )}
                      </div>
                    )}
                    {editing?.id === f.id ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={editing.text}
                          onChange={(e) => setEditing({ id: f.id, text: e.target.value })}
                          rows={3}
                          maxLength={2000}
                          autoFocus
                          placeholder="Details about this follow-up"
                          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary/50"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveNote} disabled={saving}>
                            {saving ? <><Loader2 className="size-3.5 animate-spin" /> Saving note…</> : "Save note"}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 flex items-start gap-2 text-xs">
                        {f.note && <span className="whitespace-pre-line italic text-ink-faint">{f.note}</span>}
                        {canAct && (
                          <button
                            type="button"
                            onClick={() => setEditing({ id: f.id, text: f.note ?? "" })}
                            className="inline-flex shrink-0 items-center gap-1 text-ink-faint hover:text-primary"
                          >
                            <Pencil className="size-3" /> {f.note ? "Edit note" : "Add note"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {saving && <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted"><Loader2 className="size-3.5 animate-spin" /> Saving…</span>}
                  {canWrite && (
                    <button
                      onClick={() => { if (confirmBinDelete("Delete this follow-up?")) remove(f.id); }}
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
                          disabled={!canAct || saving || on}
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

                  <div className="flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs text-ink-muted">
                    <Users className="size-3.5 shrink-0" />
                    {f.assignees.length === 0 ? (
                      <span className="text-ink-faint">Unassigned</span>
                    ) : (
                      f.assignees.map((a) => (
                        <span key={a.id} className={cn("rounded-full bg-surface-2 px-2 py-0.5 font-medium", a.id === me && "bg-primary/10 text-primary")}>
                          {a.id === me ? "Me" : a.name}
                        </span>
                      ))
                    )}
                    {canWrite && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setAssigning(assigning?.id === f.id ? null : { id: f.id, ids: f.assignees.map((a) => a.id) })}
                        className="ml-1 inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-50"
                      >
                        <Pencil className="size-3" /> {f.assignees.length ? "Change" : "Assign"}
                      </button>
                    )}
                  </div>

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

                {assigning?.id === f.id && (
                  <div className="mt-3 space-y-2 rounded-xl border border-line bg-surface-2/40 p-3">
                    <div className="text-xs font-medium text-ink-muted">Who is this follow-up assigned to? Anyone you add is told.</div>
                    <MultiPicker
                      options={users.map((u) => ({ value: u.id, label: u.id === me ? `${u.name} (me)` : u.name }))}
                      defaultValue={assigning.ids}
                      onChange={(ids) => setAssigning({ id: f.id, ids })}
                      placeholder="Search your team…"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={saving}
                        onClick={() => run(f.id, async () => {
                          const res = await setFollowUpAssignees(f.id, assigning.ids);
                          if (res.ok) setAssigning(null);
                          return res;
                        })}
                      >
                        {saving ? <><Loader2 className="size-3.5 animate-spin" /> Saving…</> : "Save assignees"}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setAssigning(null)} disabled={saving}>Cancel</Button>
                    </div>
                  </div>
                )}

                <FollowUpReports followUpId={f.id} reports={f.reports} status={f.status} me={me} canReport={mine} canManage={canManage} hasAssignees={f.assignees.length > 0} />
              </Card>
            );
          })}
          {pages > 1 && (
            <div className="flex items-center justify-between pt-2 text-sm">
              <span className="text-ink-faint">Showing {(current - 1) * PAGE_SIZE + 1} to {Math.min(current * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="secondary" disabled={current <= 1} onClick={() => setPage(current - 1)}><ChevronLeft className="size-4" /> Previous</Button>
                <span className="px-2 text-ink-muted">Page {current} of {pages}</span>
                <Button size="sm" variant="secondary" disabled={current >= pages} onClick={() => setPage(current + 1)}>Next <ChevronRight className="size-4" /></Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
