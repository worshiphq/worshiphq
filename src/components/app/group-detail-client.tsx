"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MemberAvatar } from "@/components/ui/member-avatar";
import { useFeedback } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { MultiPicker } from "@/components/app/multi-picker";
import { EditGroupDialog, GroupMessageDialog, RemindButton, type GroupRow } from "@/components/app/groups-client";
import { Users2, MapPin, CalendarClock, UserCheck, UserPlus, X, ArrowLeft, Search, Sparkles, Loader2, Crown, Phone } from "lucide-react";
import { addGroupMembers, removeGroupMember } from "@/app/actions/groups";
import { type ScheduleEntry } from "@/lib/groups/meeting-reminder";
import { cn } from "@/lib/utils";

import { matchesPerson } from "@/lib/search";
type GroupInfo = Pick<GroupRow, "id" | "name" | "type" | "description" | "schedule" | "meetingDays" | "location" | "isActive" | "onForms" | "leaderId" | "meetingReminderOn" | "meetingReminderAuto" | "meetingReminderLeadDays" | "meetingReminderHour" | "meetingReminderMinute" | "meetingReminderWeekday" | "meetingReminderText"> & {
  leader: { id: string; name: string; phone: string | null } | null;
};
type MemberInfo = { id: string; name: string; phone: string | null; photoUrl: string | null; gender: string | null; inactive: boolean };
type PersonOpt = { id: string; name: string; phone: string | null; member: boolean };

const TYPE_LABELS: Record<string, string> = { small_group: "Small group", ministry: "Ministry", committee: "Committee", fellowship: "Fellowship" };
const clock = (hm: string | null) => {
  if (!hm) return "";
  const [h, m] = hm.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};

export function GroupDetailClient({
  group, members, people, canWrite,
}: { group: GroupInfo; members: MemberInfo[]; people: PersonOpt[]; canWrite: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const shown = members.filter((m) => !q || matchesPerson(q, m));
  const candidates = people.filter((p) => !p.member).map((p) => ({ value: p.id, label: p.name, hint: p.phone ?? undefined }));
  const reachable = members.filter((m) => m.phone).length;

  const addChosen = () => {
    if (chosen.length === 0) return;
    start(async () => {
      const res = await addGroupMembers(group.id, chosen);
      if (res.ok) { toast(`${res.added} added to ${group.name}`, "success"); setChosen([]); setAdding(false); router.refresh(); }
      else toast(res.error, "error");
    });
  };

  const remove = (id: string) => {
    setRemoving(id);
    const fd = new FormData();
    fd.set("groupId", group.id);
    fd.set("personId", id);
    start(async () => { await removeGroupMember(fd); setRemoving(null); router.refresh(); });
  };

  const sched: ScheduleEntry[] = group.schedule;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start gap-3">
        <Link href="/app/groups" className="mt-1 grid size-9 place-items-center rounded-xl text-ink-muted hover:bg-surface-2" aria-label="Back to groups">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight">{group.name}</h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{TYPE_LABELS[group.type] ?? group.type}</span>
            {group.onForms && <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success"><Sparkles className="size-3" /> Open to sign-ups</span>}
            {!group.isActive && <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-ink-muted">Paused</span>}
          </div>
          {group.description && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{group.description}</p>}
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <GroupMessageDialog groupId={group.id} groupName={group.name} memberCount={members.length} label="Message group" />
            <EditGroupDialog g={group} people={people.map((p) => ({ id: p.id, name: p.name }))} typeSuggestions={["Small group", "Ministry", "Committee", "Fellowship", "Workers", "Choir", "Ushers", "Department"]} />
          </div>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex items-center gap-3 p-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Users2 className="size-5" /></span>
          <div>
            <div className="font-display text-2xl font-bold leading-none">{members.length}</div>
            <div className="mt-1 text-xs text-ink-muted">{reachable} can be texted</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold"><UserCheck className="size-5" /></span>
          <div className="min-w-0">
            <div className="text-xs text-ink-muted">Leader</div>
            <div className="truncate text-sm font-semibold">{group.leader?.name ?? "No leader yet"}</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success"><CalendarClock className="size-5" /></span>
          <div className="min-w-0">
            <div className="text-xs text-ink-muted">Meets</div>
            <div className="flex flex-wrap gap-1 pt-0.5">
              {sched.length === 0 ? <span className="text-sm text-ink-faint">Not set</span> : sched.map((e) => (
                <span key={e.day} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium">{e.day.slice(0, 3)} {clock(e.time)}</span>
              ))}
            </div>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info/10 text-info"><MapPin className="size-5" /></span>
          <div className="min-w-0">
            <div className="text-xs text-ink-muted">Where</div>
            <div className="truncate text-sm font-semibold">{group.location ?? "Not set"}</div>
          </div>
        </Card>
      </div>

      {canWrite && group.meetingReminderOn && group.meetingDays.length > 0 && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-ink-muted">
            {group.meetingReminderAuto ? "Reminders go out automatically before each meeting." : "Reminders are sent by hand."} Send one right now:
          </p>
          <RemindButton groupId={group.id} />
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[1rem] font-semibold">Members <span className="rounded-full bg-surface-2 px-2 text-xs font-medium text-ink-muted">{members.length}</span></h2>
        <div className="flex flex-wrap items-center gap-2">
          {members.length > 6 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members…" className="h-9 w-52 rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary/50" />
            </div>
          )}
          {canWrite && <Button size="sm" onClick={() => setAdding(true)}><UserPlus /> Add people</Button>}
        </div>
      </div>

      <div className={cn("mt-3", pending && "opacity-70")}>
        {shown.length === 0 ? (
          <Card className="p-10 text-center">
            <Users2 className="mx-auto size-8 text-ink-faint" />
            <p className="mt-2 text-sm text-ink-muted">{members.length === 0 ? "No members in this group yet. Add people, or let them choose it themselves on a sign-up form." : "Nobody matches that search."}</p>
          </Card>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
                <MemberAvatar name={m.name} photoUrl={m.photoUrl} gender={m.gender} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {m.name}
                    {group.leaderId === m.id && <Crown className="size-3.5 shrink-0 text-gold" aria-label="Leader" />}
                  </p>
                  <p className="flex items-center gap-1 truncate text-xs text-ink-muted">
                    {m.phone ? <><Phone className="size-3" /> {m.phone}</> : <span className="text-ink-faint">No phone</span>}
                    {m.inactive && <span className="ml-1 rounded bg-surface-2 px-1 text-[10px]">inactive</span>}
                  </p>
                </div>
                {canWrite && (
                  <button onClick={() => remove(m.id)} disabled={pending} className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger" title="Remove from group">
                    {removing === m.id ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={adding} onClose={() => (pending ? undefined : setAdding(false))} title={`Add people to ${group.name}`} description="Search and tick as many as you like, then add them in one go.">
        <div className="space-y-4">
          <MultiPicker options={candidates} defaultValue={chosen} onChange={setChosen} placeholder="Search by name or phone…" emptyLabel="Nobody picked yet" />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setAdding(false)} disabled={pending}>Cancel</Button>
            <Button className="flex-1" onClick={addChosen} disabled={pending || chosen.length === 0}>
              {pending ? <><Loader2 className="animate-spin" /> Adding…</> : <><UserPlus /> Add {chosen.length || ""} {chosen.length === 1 ? "person" : "people"}</>}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
