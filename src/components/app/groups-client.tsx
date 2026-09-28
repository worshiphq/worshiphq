"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import {
  Search, Users2, MapPin, Calendar, User, Trash2, ChevronRight, Pencil, Bell, Loader2, MessageSquare, Send,
} from "lucide-react";
import { deleteGroup, updateGroup, sendGroupMeetingReminder } from "@/app/actions/groups";
import { sendBroadcast } from "@/app/actions/communications";
import { ActionDialog } from "@/components/app/action-dialog";
import { GroupFields } from "@/components/app/group-fields";
import { Modal } from "@/components/ui/modal";
import { formatSchedule, type ScheduleEntry } from "@/lib/groups/meeting-reminder";
import { cn } from "@/lib/utils";
import Link from "next/link";

type GroupRow = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  schedule: ScheduleEntry[];
  meetingDays: string[];
  location: string | null;
  isActive: boolean;
  leaderId: string | null;
  leaderName: string | null;
  memberCount: number;
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

export function GroupsClient({ items, people, typeSuggestions, canWrite }: {
  items: GroupRow[];
  people: PersonOpt[];
  typeSuggestions: string[];
  canWrite: boolean;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [pending, start] = useTransition();

  const types = [...new Set(items.map((g) => g.type))];

  const filtered = items.filter((g) => {
    if (typeFilter !== "all" && g.type !== typeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      g.leaderName?.toLowerCase().includes(q) ||
      g.location?.toLowerCase().includes(q)
    );
  });

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => deleteGroup(fd));
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            placeholder="Search groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1">
          <Button
            variant={typeFilter === "all" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setTypeFilter("all")}
          >
            All
          </Button>
          {types.map((t) => (
            <Button
              key={t}
              variant={typeFilter === t ? "primary" : "secondary"}
              size="sm"
              onClick={() => setTypeFilter(t)}
            >
              {TYPE_LABELS[t] ?? t}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Users2 className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {search ? "No groups match your search." : "No groups yet. Create one to get started."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((g) => (
            <Card key={g.id} className={`relative p-4 transition hover:shadow-md ${pending ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <Link href={`/app/groups/${g.id}`} className="group flex items-center gap-1">
                    <h3 className="text-sm font-semibold group-hover:text-brand">{g.name}</h3>
                    <ChevronRight className="size-3.5 text-ink-faint group-hover:text-brand" />
                  </Link>
                  <Badge variant="default" className="mt-1 text-[10px]">
                    {TYPE_LABELS[g.type] ?? g.type}
                  </Badge>
                </div>
                {canWrite && (
                  <div className="flex shrink-0 items-center gap-1">
                    <GroupMessageDialog groupId={g.id} groupName={g.name} memberCount={g.memberCount} />
                    <EditGroupDialog g={g} people={people} typeSuggestions={typeSuggestions} />
                    <button
                      onClick={() => handleDelete(g.id)}
                      className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
                      title="Delete"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>

              {g.description && (
                <p className="mt-2 line-clamp-2 text-xs text-ink-muted">{g.description}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                <span className="flex items-center gap-1">
                  <Users2 className="size-3" /> {g.memberCount} member{g.memberCount !== 1 ? "s" : ""}
                </span>
                {g.leaderName && (
                  <span className="flex items-center gap-1">
                    <User className="size-3" /> {g.leaderName}
                  </span>
                )}
                {g.schedule.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" /> {formatSchedule(g.schedule)}
                  </span>
                )}
                {g.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" /> {g.location}
                  </span>
                )}
              </div>

              {canWrite && g.meetingReminderOn && g.meetingDays.length > 0 && (
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
                  <span className="flex items-center gap-1 text-[11px] text-ink-faint">
                    <Bell className="size-3" />
                    {g.meetingReminderAuto
                      ? g.nextReminderLabel
                        ? <>Next: <span className="font-medium text-ink-muted">{g.nextReminderLabel}</span></>
                        : "Auto reminder on"
                      : "Manual reminder"}
                  </span>
                  <RemindButton groupId={g.id} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EditGroupDialog({ g, people, typeSuggestions }: {
  g: GroupRow; people: PersonOpt[]; typeSuggestions: string[];
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
 *  scheduled meeting reminder above and from Reminders & automations. Just a
 *  quick way to text/email a group ("bring your Bible Sunday", etc.). */
function GroupMessageDialog({ groupId, groupName, memberCount }: { groupId: string; groupName: string; memberCount: number }) {
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
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg p-1.5 text-ink-faint hover:bg-primary/10 hover:text-primary"
        title="Message this group"
      >
        <MessageSquare className="size-4" />
      </button>
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
                className={cn(
                  "rounded-xl border py-2.5 text-sm font-medium transition-colors",
                  channel === c ? "border-primary/50 bg-primary/10 text-ink" : "border-line text-ink-muted hover:bg-surface-2",
                )}
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
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/25 resize-none"
            />
            <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-faint">
              <span>Address each person by name:</span>
              <button
                type="button"
                onClick={() => setMessage((m) => `${m}{name}`)}
                className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted hover:bg-primary/10 hover:text-primary"
              >
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
function RemindButton({ groupId }: { groupId: string }) {
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
      Remind
    </Button>
  );
}
