"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Trash2, Heart, Users, Shield, BookOpen, AlertTriangle, CircleDot, CheckCircle2, Clock } from "lucide-react";
import { deleteCounselingSession, updateCounselingStatus } from "@/app/actions/counseling";
import { useFeedback } from "@/components/ui/feedback";
import { formatDate } from "@/lib/utils";

interface Session {
  id: string;
  type: string;
  summary: string;
  notes: string | null;
  status: string;
  confidential: boolean;
  memberName: string | null;
  counselorName: string | null;
  date: string;
  followUpDate: string | null;
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Heart }> = {
  general: { label: "General", icon: BookOpen },
  marriage: { label: "Marriage", icon: Heart },
  grief: { label: "Grief", icon: AlertTriangle },
  spiritual: { label: "Spiritual", icon: Shield },
  family: { label: "Family", icon: Users },
  addiction: { label: "Addiction", icon: AlertTriangle },
  other: { label: "Other", icon: CircleDot },
};

const STATUS_STYLE: Record<string, { label: string; color: string; icon: typeof CircleDot }> = {
  open: { label: "Open", color: "text-brand bg-brand/10", icon: CircleDot },
  "follow-up": { label: "Follow-up", color: "text-gold bg-gold/10", icon: Clock },
  closed: { label: "Closed", color: "text-success bg-success/10", icon: CheckCircle2 },
};

export function CounselingClient({ sessions }: { sessions: Session[] }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pending, start] = useTransition();
  const { toast } = useFeedback();

  const filtered = useMemo(() => {
    let list = sessions;
    if (statusFilter !== "all") list = list.filter((s) => s.status === statusFilter);
    if (q) list = list.filter((s) => s.summary.toLowerCase().includes(q.toLowerCase()) || s.memberName?.toLowerCase().includes(q.toLowerCase()));
    return list;
  }, [sessions, q, statusFilter]);

  const overdue = sessions.filter((s) => s.followUpDate && s.status !== "closed" && new Date(s.followUpDate) < new Date()).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sessions..." className="h-10 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-sm" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm">
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="follow-up">Follow-up</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface p-3 text-center">
          <div className="text-2xl font-bold">{sessions.length}</div>
          <div className="text-xs text-ink-muted">Total sessions</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3 text-center">
          <div className="text-2xl font-bold text-brand">{sessions.filter((s) => s.status === "open").length}</div>
          <div className="text-xs text-ink-muted">Open</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3 text-center">
          <div className="text-2xl font-bold text-gold">{sessions.filter((s) => s.status === "follow-up").length}</div>
          <div className="text-xs text-ink-muted">Follow-up</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3 text-center">
          <div className="text-2xl font-bold text-danger">{overdue}</div>
          <div className="text-xs text-ink-muted">Overdue</div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink-faint">
          No counseling sessions recorded. Use the button above to log a session.
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((s) => {
            const typeCfg = TYPE_CONFIG[s.type] ?? TYPE_CONFIG.other;
            const statusCfg = STATUS_STYLE[s.status] ?? STATUS_STYLE.open;
            const TypeIcon = typeCfg.icon;
            const StatusIcon = statusCfg.icon;
            const isOverdue = s.followUpDate && s.status !== "closed" && new Date(s.followUpDate) < new Date();
            return (
              <div key={s.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TypeIcon className="size-4 text-ink-muted" />
                    <span className="text-xs font-medium text-ink-muted">{typeCfg.label}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusCfg.color}`}>
                      <StatusIcon className="size-3" /> {statusCfg.label}
                    </span>
                    {s.confidential && <span title="Confidential"><Shield className="size-3.5 text-danger" /></span>}
                  </div>
                  <div className="flex gap-1">
                    {s.status !== "closed" && (
                      <form action={(fd) => start(async () => { fd.set("id", s.id); fd.set("status", "closed"); await updateCounselingStatus(fd); toast("Session closed", "success"); })}>
                        <button type="submit" disabled={pending} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-success/10 hover:text-success" title="Close">
                          <CheckCircle2 className="size-4" />
                        </button>
                      </form>
                    )}
                    <form action={(fd) => start(async () => { fd.set("id", s.id); await deleteCounselingSession(fd); toast("Session deleted", "info"); })}>
                      <button type="submit" disabled={pending} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                        <Trash2 className="size-4" />
                      </button>
                    </form>
                  </div>
                </div>
                <p className="mt-2 text-sm font-medium">{s.summary}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-faint">
                  {s.memberName && <span>Member: {s.memberName}</span>}
                  {s.counselorName && <span>Counselor: {s.counselorName}</span>}
                  <span>{formatDate(s.date)}</span>
                  {s.followUpDate && (
                    <span className={isOverdue ? "font-semibold text-danger" : ""}>
                      Follow-up: {formatDate(s.followUpDate)} {isOverdue ? "(overdue)" : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
