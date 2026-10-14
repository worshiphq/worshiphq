"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { MemberAvatar } from "@/components/ui/member-avatar";
import {
  Search, Users2, MapPin, Trash2, Pencil, Bell, Loader2, MessageSquare, Send, Sparkles, UserCheck, CalendarClock, Link2, ArrowRight,
} from "lucide-react";
import { deleteGroup, updateGroup, sendGroupMeetingReminder } from "@/app/actions/groups";
import { sendBroadcast } from "@/app/actions/communications";
import { ActionDialog } from "@/components/app/action-dialog";
import { GroupFields } from "@/components/app/group-fields";
import { Modal } from "@/components/ui/modal";
import { type ScheduleEntry, describeLead } from "@/lib/groups/meeting-reminder";
import { Pager, filterSelectCls } from "@/components/app/list-filters";
import { cn } from "@/lib/utils";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";

export type GroupRow = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  schedule: ScheduleEntry[];
  meetingDays: string[];
  location: string | null;
  isActive: boolean;
  onForms: boolean;
  leaderId: string | null;
  leaderName: string | null;
  memberCount: number;
  preview: { name: string; photoUrl: string | null; gender: string | null }[];
  meetingReminderOn: boolean;
  meetingReminderAuto: boolean;
  meetingReminderLeadDays: number;
  meetingReminderHour: number;
  meetingReminderMinute: number;
  meetingReminderWeekday: number | null;
  meetingReminderText: string | null;
  nextReminderLabel: string | null;
};

type PersonOpt = { id: string; name: string };

const TYPE_LABELS: Record<string, string> = {
  small_group: "Small group",
  ministry: "Ministry",
  committee: "Committee",
  fellowship: "Fellowship",
};
const typeLabel = (t: string) => TYPE_LABELS[t] ?? t;
/** 18:00 -> 6pm, 09:30 -> 9:30am */
const clock = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  if (Number.isNaN(h)) return hm;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};

/** A calm colour per type so cards are easy to tell apart at a glance. */
const TONES = ["bg-primary/10 text-primary", "bg-success/10 text-success", "bg-gold/15 text-gold", "bg-info/10 text-info", "bg-danger/10 text-danger", "bg-brand/10 text-brand"];
const toneFor = (type: string) => {
  let h = 0;
  for (const c of type) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
};

export function GroupsClient({ items, people, typeSuggestions, canWrite, stats }: {
  items: GroupRow[];
  people: PersonOpt[];
  typeSuggestions: string[];
  canWrite: boolean;
  stats: { groups: number; inGroups: number; onForms: number; meetingThisWeek: number };
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sort, setSort] = useState<"name" | "members">("name");
  const [page, setPage] = useState(1);
  const [pending, start] = useTransition();
  const PAGE_SIZE = 12;

  const types = [...new Set(items.map((g) => g.type))].sort();
  const q = search.trim().toLowerCase();
  const filtered = items
    .filter((g) => {
      if (typeFilter !== "all" && g.type !== typeFilter) return false;
      if (!q) return true;
      return g.name.toLowerCase().includes(q) || !!g.leaderName?.toLowerCase().includes(q) || !!g.location?.toLowerCase().includes(q) || !!g.description?.toLowerCase().includes(q);
    })
    .sort((a, b) => (sort === "members" ? b.memberCount - a.memberCount || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)));
  const cur = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const shown = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    if (!confirmBinDelete("Delete this group? Its members stay in your church.")) return;
    start(async () => { await deleteGroup(fd); binDeleted(); });
  };

  return (
    <div className="mt-5 space-y-4">
      {/* ── At a glance ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Groups", value: stats.groups, icon: Users2 },
          { label: "People in a group", value: stats.inGroups, icon: UserCheck },
          { label: "Meet regularly", value: stats.meetingThisWeek, icon: CalendarClock },
          { label: "Open to sign-ups", value: stats.onForms, icon: Link2 },
        ].map((s) => (
          <Card key={s.label} className="flex items-center gap-3 p-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><s.icon className="size-5" /></span>
            <div>
              <div className="font-display text-2xl font-bold leading-none">{s.value}</div>
              <div className="mt-1 text-xs text-ink-muted">{s.label}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Find ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input
            placeholder="Search groups, leaders, places…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-10 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-sm outline-none focus:border-primary/50"
          />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={filterSelectCls} aria-label="Sort">
          <option value="name">A to Z</option>
          <option value="members">Biggest first</option>
        </select>
      </div>
      {types.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {["all", ...types].map((t) => {
            const count = t === "all" ? items.length : items.filter((g) => g.type === t).length;
            return (
              <Button key={t} variant={typeFilter === t ? "primary" : "secondary"} size="sm" onClick={() => { setTypeFilter(t); setPage(1); }}>
                {t === "all" ? "All" : typeLabel(t)}
                <span className={cn("ml-1 rounded-full px-1.5 text-[11px] font-semibold", typeFilter === t ? "bg-white/25" : "bg-surface-2 text-ink-faint")}>{count}</span>
              </Button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Users2 className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">{search || typeFilter !== "all" ? "No groups match those filters." : "No groups yet. Create one to get started."}</p>
        </Card>
      ) : (
        <>
          <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", pending && "opacity-60")}>
            {shown.map((g) => (
              <Card key={g.id} className="flex flex-col overflow-hidden p-0 transition hover:shadow-md">
                <div className="flex items-start gap-3 p-4">
                  <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl text-base font-bold", toneFor(g.type))}>
                    {g.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/app/groups/${g.id}`} className="group inline-flex max-w-full items-center gap-1">
                      <h3 className="truncate text-[0.95rem] font-semibold group-hover:text-primary">{g.name}</h3>
                      <ArrowRight className="size-3.5 shrink-0 text-ink-faint opacity-0 transition group-hover:opacity-100" />
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", toneFor(g.type))}>{typeLabel(g.type)}</span>
                      {g.onForms && <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success"><Sparkles className="size-3" /> Open to sign-ups</span>}
                      {!g.isActive && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-muted">Paused</span>}
                    </div>
                  </div>
                </div>

                {g.description && <p className="line-clamp-2 px-4 text-xs text-ink-muted">{g.description}</p>}

                <div className="mt-3 space-y-2 px-4 text-xs text-ink-muted">
                  {g.schedule.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CalendarClock className="size-3.5 shrink-0" />
                      {g.schedule.map((e) => (
                        <span key={e.day} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink">{e.day.slice(0, 3)}{e.time ? ` ${clock(e.time)}` : ""}</span>
                      ))}
                    </div>
                  )}
                  {g.location && <div className="flex items-center gap-1.5"><MapPin className="size-3.5 shrink-0" /> {g.location}</div>}
                  {g.leaderName && <div className="flex items-center gap-1.5"><UserCheck className="size-3.5 shrink-0" /> Led by <span className="font-medium text-ink">{g.leaderName}</span></div>}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 px-4">
                  <div className="flex items-center">
                    {g.preview.map((m, i) => (
                      <span key={i} className={cn("rounded-full ring-2 ring-surface", i > 0 && "-ml-2")}>
                        <MemberAvatar name={m.name} photoUrl={m.photoUrl} gender={m.gender} size="xs" />
                      </span>
                    ))}
                    <span className={cn("text-xs font-medium text-ink-muted", g.preview.length > 0 && "ml-2")}>
                      {g.memberCount === 0 ? "No members yet" : `${g.memberCount} member${g.memberCount === 1 ? "" : "s"}`}
                    </span>
                  </div>
                </div>

                {canWrite && g.meetingReminderOn && g.meetingDays.length > 0 && (
                  <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-lg bg-surface-2/60 px-2.5 py-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-muted">
                      <Bell className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {g.meetingReminderAuto
                          ? g.nextReminderLabel ? <>Next reminder: <span className="font-medium text-ink">{g.nextReminderLabel}</span></> : "Automatic reminders on"
                          : "Manual reminders"}
                      </span>
                    </span>
                    <RemindButton groupId={g.id} />
                  </div>
                )}
                {canWrite && g.meetingReminderOn && g.meetingReminderAuto && g.schedule.some((s) => s.remind) && (
                  <ul className="mx-4 mt-2 space-y-0.5 text-[11px] text-ink-faint">
                    {g.schedule.map((s) => (
                      <li key={s.day}>
                        <span className="font-medium text-ink-muted">{s.day.slice(0, 3)}</span>{" "}
                        {s.remind ? (s.remind.off ? "no reminder" : `reminded ${describeLead(s.remind.leadDays, s.remind.hour, s.remind.minute)}`) : "follows the group default"}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-auto flex items-center gap-1.5 border-t border-line p-3 pt-3">
                  <Link href={`/app/groups/${g.id}`} className="flex-1">
                    <Button variant="secondary" size="sm" className="w-full" type="button"><Users2 /> Members</Button>
                  </Link>
                  {canWrite && (
                    <>
                      <GroupMessageDialog groupId={g.id} groupName={g.name} memberCount={g.memberCount} />
                      <EditGroupDialog g={g} people={people} typeSuggestions={typeSuggestions} />
                      <button onClick={() => handleDelete(g.id)} className="grid size-9 place-items-center rounded-xl text-ink-faint hover:bg-danger/10 hover:text-danger" title="Delete">
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <Pager page={cur} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
        </>
      )}
    </div>
  );
}

export function EditGroupDialog({ g, people, typeSuggestions }: {
  g: Pick<GroupRow, "id" | "name" | "type" | "description" | "schedule" | "meetingDays" | "location" | "leaderId" | "onForms" | "meetingReminderOn" | "meetingReminderAuto" | "meetingReminderLeadDays" | "meetingReminderHour" | "meetingReminderMinute" | "meetingReminderWeekday" | "meetingReminderText">;
  people: PersonOpt[];
  typeSuggestions: string[];
}) {
  return (
    <ActionDialog
      triggerLabel=""
      triggerIcon={<Pencil className="size-4" />}
      variant="secondary"
      title="Edit group"
      description="Update this group’s details."
      submitLabel="Save changes"
      action={updateGroup}
      successMessage="Group updated"
    >
      <input type="hidden" name="id" value={g.id} />
      <GroupFields group={g} people={people} typeSuggestions={typeSuggestions} />
    </ActionDialog>
  );
}

/** Manual, one-off message to everyone in the group - separate from the
 *  scheduled meeting reminder and from Reminders & automations. */
export function GroupMessageDialog({ groupId, groupName, memberCount, label }: { groupId: string; groupName: string; memberCount: number; label?: string }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"SMS" | "Email">("SMS");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const { toast } = useFeedback();
  const router = useRouter();

  function send() {
    if (!message.trim()) return;
    const fd = new FormData();
    fd.set("name", `${groupName} message`);
    fd.set("channel", channel);
    fd.set("target", `group:${groupId}`);
    fd.set("message", message);
    start(async () => {
      await sendBroadcast(fd);
      toast("Message sent", "success");
      setOpen(false);
      setMessage("");
      router.refresh();
    });
  }

  return (
    <>
      {label ? (
        <Button variant="secondary" size="sm" type="button" onClick={() => setOpen(true)}><MessageSquare /> {label}</Button>
      ) : (
        <button onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-xl text-ink-faint hover:bg-primary/10 hover:text-primary" title="Message this group">
          <MessageSquare className="size-4" />
        </button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Message ${groupName}`}
        description={`Sends to all ${memberCount} member${memberCount !== 1 ? "s" : ""} with a phone number or email on file. This is manual - it's separate from any automatic reminders.`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(["SMS", "Email"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={cn("rounded-xl border py-2.5 text-sm font-medium transition-colors", channel === c ? "border-primary/50 bg-primary/10 text-ink" : "border-line text-ink-muted hover:bg-surface-2")}
              >
                {c}
              </button>
            ))}
          </div>
          <div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Hi {name}, don't forget..."
              className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/25"
            />
            <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-faint">
              <span>Address each person by name:</span>
              <button type="button" onClick={() => setMessage((m) => `${m}{name}`)} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted hover:bg-primary/10 hover:text-primary">
                {"{name}"}
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="flex-1" disabled={!message.trim() || pending} onClick={send}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {pending ? "Sending…" : `Send ${channel}`}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Manual "send the meeting reminder now" button. */
export function RemindButton({ groupId }: { groupId: string }) {
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await sendGroupMeetingReminder(groupId);
          if (res?.ok) { toast(`Reminder sent to ${res.sent} member${res.sent === 1 ? "" : "s"}.`, "success"); router.refresh(); }
          else toast(res?.error ?? "Couldn’t send", "error");
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Bell className="size-3.5" />}
      {pending ? "Sending…" : "Remind now"}
    </Button>
  );
}
